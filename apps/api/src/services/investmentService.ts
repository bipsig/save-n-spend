import mongoose from "mongoose";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { monthRange } from "../utils/monthRange";
import type { InvestmentsPayload, InvestmentHolding } from "@save-n-spend/types";
import { annualReturnOf, holdingFlows, type Flow } from "./investmentMath";

// Everything the Investments hub needs, in one place. An investment is an account of type
// "investment"; funding it is a transfer IN, redeeming is a transfer OUT, and a revaluation
// is a pos/neg adjustment on it (see the balance-sync endpoint). So:
//   invested = Σ transfers in − Σ transfers out   (net contributions / cost basis)
//   current  = the account's stored balance
//   gain     = current − invested                 (= Σ of its adjustments)
// Nothing here needs market data — every figure is user-entered.
export const getInvestments = async (userId: string, zone: string): Promise<InvestmentsPayload> => {
    const oid = new mongoose.Types.ObjectId(userId);

    const accounts = await Account.find({ userId: oid, type: "investment", isArchived: false })
        .sort({ order: 1, createdAt: 1 })
        .lean();

    if (accounts.length === 0) {
        return {
            holdings: [],
            totals: { invested: 0, current: 0, gain: 0, annualReturn: null, annualReturnStatus: "unavailable" },
            allocation: [],
            thisMonth: { contributed: 0, portfolioChange: 0, income: 0 },
        };
    }

    const ids = accounts.map((a) => a._id);
    const { start, next } = monthRange(zone);

    const [transfers, adjRows, monthIn, monthAdj, monthIncome] = await Promise.all([
        // Dated, not summed: the yearly return needs when each contribution and redemption
        // happened, not just how much.
        Transaction.find({ userId: oid, type: "transfer", $or: [{ toAccount: { $in: ids } }, { account: { $in: ids } }] })
            .select("amount account toAccount occurredAt")
            .lean(),
        Transaction.aggregate<{ _id: mongoose.Types.ObjectId; last: Date }>([
            { $match: { userId: oid, type: { $in: ["positiveAdjustment", "negativeAdjustment"] }, account: { $in: ids } } },
            { $group: { _id: "$account", last: { $max: "$occurredAt" } } },
        ]),
        Transaction.aggregate<{ _id: null; total: number }>([
            { $match: { userId: oid, type: "transfer", toAccount: { $in: ids }, occurredAt: { $gte: start, $lt: next } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Transaction.aggregate<{ _id: null; total: number }>([
            { $match: { userId: oid, type: { $in: ["positiveAdjustment", "negativeAdjustment"] }, account: { $in: ids }, occurredAt: { $gte: start, $lt: next } } },
            { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ["$type", "positiveAdjustment"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
        ]),
        // Income logged this month — the denominator for "what share did I invest". Not
        // scoped to the investment accounts: it's income into any account.
        Transaction.aggregate<{ _id: null; total: number }>([
            { $match: { userId: oid, type: "income", occurredAt: { $gte: start, $lt: next } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
    ]);

    const inBy = new Map<string, Flow[]>();
    const outBy = new Map<string, Flow[]>();
    const push = (map: Map<string, Flow[]>, key: string, flow: Flow) => {
        const list = map.get(key);
        if (list) list.push(flow);
        else map.set(key, [flow]);
    };
    for (const t of transfers) {
        const flow = { amount: t.amount, at: new Date(t.occurredAt) };
        if (t.toAccount) push(inBy, String(t.toAccount), flow);
        push(outBy, String(t.account), flow);
    }
    const sum = (flows: Flow[] | undefined) => (flows ?? []).reduce((s, f) => s + f.amount, 0);
    const now = new Date();
    // Every holding's dated flows, for the portfolio figure. A holding with value but no
    // date for its opening amount makes the combined figure unknowable, not just smaller.
    const portfolioFlows: Flow[] = [];
    let portfolioComplete = true;
    const lastBy = new Map(adjRows.map((r) => [String(r._id), r.last]));

    const holdings: InvestmentHolding[] = accounts.map((a) => {
        const key = String(a._id);
        // The opening balance is the holding's initial cost basis (money already invested
        // when you started tracking it), not a gain — so it counts toward `invested`
        // alongside later contributions, minus anything redeemed.
        const contributions = inBy.get(key) ?? [];
        const redemptions = outBy.get(key) ?? [];
        const invested = a.startingBalance + sum(contributions) - sum(redemptions);
        const current = a.balance;
        const last = lastBy.get(key);
        const flows = holdingFlows({
            startingBalance: a.startingBalance,
            investedSince: a.investedSince ? new Date(a.investedSince) : null,
            investedHow: a.investedHow ?? null,
            createdAt: new Date((a as unknown as { createdAt: Date }).createdAt),
            contributions,
            redemptions,
            current,
            now,
        });
        if (flows) portfolioFlows.push(...flows);
        else if (current > 0) portfolioComplete = false;
        return {
            accountId: key,
            name: a.name,
            icon: a.icon,
            color: a.color,
            kind: a.investmentKind ?? "Other",
            invested,
            current,
            gain: current - invested,
            lastUpdatedAt: last ? new Date(last).toISOString() : null,
            investedSince: a.investedSince ? new Date(a.investedSince).toISOString() : null,
            investedHow: a.investedHow ?? null,
            ...annualReturnOf(flows, now),
        };
    });

    const sums = holdings.reduce(
        (acc, h) => ({ invested: acc.invested + h.invested, current: acc.current + h.current, gain: acc.gain + h.gain }),
        { invested: 0, current: 0, gain: 0 },
    );
    const totals = { ...sums, ...annualReturnOf(portfolioComplete ? portfolioFlows : null, now) };

    const byKind = new Map<string, number>();
    for (const h of holdings) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + h.current);
    const allocation = [...byKind]
        .map(([kind, current]) => ({ kind, current }))
        .sort((a, b) => b.current - a.current);

    const thisMonth = {
        contributed: monthIn[0]?.total ?? 0,
        portfolioChange: monthAdj[0]?.total ?? 0,
        income: monthIncome[0]?.total ?? 0,
    };

    return { holdings, totals, allocation, thisMonth };
};

// One holding's full ledger — contributions, redemptions, AND value-updates. The general
// transactions feed drops adjustments (they aren't spending), so it can't show the value
// changes that are the whole point of a holding's history; this returns them.
export const getInvestmentHistory = async (userId: string, accountId: string) => {
    const oid = new mongoose.Types.ObjectId(userId);
    const aid = new mongoose.Types.ObjectId(accountId);
    return Transaction.find({ userId: oid, $or: [{ account: aid }, { toAccount: aid }] })
        .sort({ occurredAt: -1 })
        .limit(200)
        .lean();
};

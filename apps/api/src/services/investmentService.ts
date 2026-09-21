import mongoose from "mongoose";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { monthRange } from "../utils/monthRange";
import type { InvestmentsPayload, InvestmentHolding } from "@save-n-spend/types";

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
        return { holdings: [], totals: { invested: 0, current: 0, gain: 0 }, allocation: [], thisMonth: { contributed: 0, portfolioChange: 0, income: 0 } };
    }

    const ids = accounts.map((a) => a._id);
    const { start, next } = monthRange(zone);

    const [inRows, outRows, adjRows, monthIn, monthAdj, monthIncome] = await Promise.all([
        Transaction.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
            { $match: { userId: oid, type: "transfer", toAccount: { $in: ids } } },
            { $group: { _id: "$toAccount", total: { $sum: "$amount" } } },
        ]),
        Transaction.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
            { $match: { userId: oid, type: "transfer", account: { $in: ids } } },
            { $group: { _id: "$account", total: { $sum: "$amount" } } },
        ]),
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

    const inBy = new Map(inRows.map((r) => [String(r._id), r.total]));
    const outBy = new Map(outRows.map((r) => [String(r._id), r.total]));
    const lastBy = new Map(adjRows.map((r) => [String(r._id), r.last]));

    const holdings: InvestmentHolding[] = accounts.map((a) => {
        const key = String(a._id);
        // The opening balance is the holding's initial cost basis (money already invested
        // when you started tracking it), not a gain — so it counts toward `invested`
        // alongside later contributions, minus anything redeemed.
        const invested = a.startingBalance + (inBy.get(key) ?? 0) - (outBy.get(key) ?? 0);
        const current = a.balance;
        const last = lastBy.get(key);
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
        };
    });

    const totals = holdings.reduce(
        (acc, h) => ({ invested: acc.invested + h.invested, current: acc.current + h.current, gain: acc.gain + h.gain }),
        { invested: 0, current: 0, gain: 0 },
    );

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

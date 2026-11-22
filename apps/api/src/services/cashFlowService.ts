import mongoose from "mongoose";
import Account from "../models/Account";
import Bill from "../models/Bill";
import { projectCashFlow } from "./cashFlowMath";
import { liquidBalance } from "./accountGroups";
import { loadRecurringPatterns, typicalDailySpend } from "./recurringService";
import { matchesBill } from "./recurringMath";
import type { CashFlowPayload } from "@save-n-spend/types";


export const getCashFlow = async (userId: string, zone: string, now: Date = new Date()): Promise<CashFlowPayload> => {
    const oid = new mongoose.Types.ObjectId(userId);

    const [accounts, bills, { patterns, billFacts }] = await Promise.all([
        Account.find({ userId: oid, isArchived: false }).select("type balance").lean(),
        Bill.find({ userId: oid }).select("name amount dueDate status recurring frequency toInvestment pausedAt").lean(),
        loadRecurringPatterns(oid, zone, now),
    ]);

    // Only expenses a bill already covers are taken out of the average — those get their own
    // day on the calendar. A recurring expense that isn't a bill has no day of its own, so it
    // has to stay in the average or it would vanish from the projection.
    const billed = new Set(patterns.filter((p) => p.kind === "expense" && matchesBill(p, billFacts)).map((p) => p.key));
    const dailySpend = await typicalDailySpend(oid, zone, now, billed, bills.map((b) => b.name));

    return projectCashFlow({
        now,
        zone,
        startBalance: liquidBalance(accounts),
        dailySpend,
        bills: bills.map((b) => ({
            id: String(b._id),
            name: b.name,
            amount: b.amount,
            dueDate: new Date(b.dueDate),
            status: b.status,
            recurring: b.recurring,
            frequency: b.frequency,
            toInvestment: b.toInvestment ? String(b.toInvestment) : null,
            pausedAt: b.pausedAt ?? null,
        })),
        income: patterns
            .filter((p) => p.kind === "income")
            .map((p) => ({ key: p.key, title: p.title, amount: p.amount, lastAt: p.lastAt, occurrences: p.occurrences })),
    });
};

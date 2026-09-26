import type { CashFlowDay, CashFlowItem, CashFlowPayload } from "@save-n-spend/types";
import {
    addDaysInZone,
    addMonthsInZone,
    addYearsInZone,
    dayKeyInZone,
    startOfDayInZone,
    startOfMonthInZone,
} from "../utils/timezone";

// The day-by-day projection behind the cash-flow calendar. Pure, so it can be tested:
// the service gathers today's liquid balance, the bills, the expected income and the
// typical daily spend, and this lays them out from today to the end of next month.
//
//   balance(day) = balance(day − 1) + income − bills − dailySpend
//
// Today carries its items but not a day of typical spending — part of it has already
// happened and is in the starting balance.

export type ProjectionBill = {
    id: string;
    name: string;
    amount: number;
    dueDate: Date;
    status: "pending" | "paid";
    recurring: boolean;
    frequency?: "monthly" | "yearly";
    toInvestment?: string | null;
};

export type ProjectionIncome = {
    key: string;
    title: string;
    amount: number;
    lastAt: Date;
    occurrences: number;
};

/** Expected income this many days late still counts as coming (put on today) rather than
 *  skipped to next month — salary a couple of days late is normal. */
const LATE_INCOME_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Last day of next month, in the zone. The calendar pages through this month and next. */
export const horizonEnd = (now: Date, zone: string): Date =>
    addDaysInZone(addMonthsInZone(startOfMonthInZone(now, zone), zone, 2), zone, -1);

export const projectCashFlow = (input: {
    now: Date;
    zone: string;
    startBalance: number;
    dailySpend: number;
    bills: ProjectionBill[];
    income: ProjectionIncome[];
}): CashFlowPayload => {
    const { now, zone, startBalance, dailySpend } = input;
    const todayKey = dayKeyInZone(now, zone);
    const endKey = dayKeyInZone(horizonEnd(now, zone), zone);

    const itemsByDay = new Map<string, CashFlowItem[]>();
    const place = (key: string, item: CashFlowItem): void => {
        if (key > endKey) return;
        const list = itemsByDay.get(key);
        if (list) list.push(item);
        else itemsByDay.set(key, [item]);
    };

    for (const bill of input.bills) {
        if (bill.status === "paid") continue;
        const base: CashFlowItem = {
            kind: bill.toInvestment ? "sip" : "bill",
            name: bill.name,
            amount: bill.amount,
            billId: bill.id,
        };
        let due = bill.dueDate;
        // Already past due and unpaid: it still has to be paid, so it lands today.
        if (dayKeyInZone(due, zone) < todayKey) {
            place(todayKey, { ...base, overdue: true });
            if (!bill.recurring) continue;
            due = bill.frequency === "yearly" ? addYearsInZone(due, zone, 1) : addMonthsInZone(due, zone, 1);
            while (dayKeyInZone(due, zone) < todayKey) {
                due = bill.frequency === "yearly" ? addYearsInZone(due, zone, 1) : addMonthsInZone(due, zone, 1);
            }
        }
        if (!bill.recurring) {
            place(dayKeyInZone(due, zone), base);
            continue;
        }
        // Counted from the stored due date each time rather than stepping, so a month-end
        // bill doesn't drift through clamped months.
        const first = due;
        for (let n = 0; ; n++) {
            const at = bill.frequency === "yearly" ? addYearsInZone(first, zone, n) : addMonthsInZone(first, zone, n);
            const key = dayKeyInZone(at, zone);
            if (key > endKey) break;
            place(key, base);
        }
    }

    for (const inc of input.income) {
        const item: CashFlowItem = {
            kind: "income",
            name: inc.title,
            amount: inc.amount,
            patternKey: inc.key,
            basedOnMonths: inc.occurrences,
        };
        for (let n = 1; ; n++) {
            const at = addMonthsInZone(inc.lastAt, zone, n);
            const key = dayKeyInZone(at, zone);
            if (key > endKey) break;
            if (key < todayKey) {
                const lateDays = (startOfDayInZone(now, zone).getTime() - startOfDayInZone(at, zone).getTime()) / DAY_MS;
                // Due recently but not in yet — still expected, today. Any older and it
                // was skipped; the next month's occurrence is the one that counts.
                if (lateDays <= LATE_INCOME_GRACE_DAYS) place(todayKey, item);
                continue;
            }
            place(key, item);
        }
    }

    const days: CashFlowDay[] = [];
    let balance = startBalance;
    let lowest: { date: string; balance: number } | null = null;
    for (let cursor = startOfDayInZone(now, zone), i = 0; ; cursor = addDaysInZone(cursor, zone, 1), i++) {
        const key = dayKeyInZone(cursor, zone);
        if (key > endKey) break;
        const items = itemsByDay.get(key) ?? [];
        if (i > 0) balance -= dailySpend;
        for (const item of items) balance += item.kind === "income" ? item.amount : -item.amount;
        days.push({ date: key, items, balance });
        if (!lowest || balance < lowest.balance) lowest = { date: key, balance };
    }

    return { startBalance, dailySpend, days, lowest: lowest ?? { date: todayKey, balance: startBalance }, endBalance: balance };
};

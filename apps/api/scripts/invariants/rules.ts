import { planLedger } from "../../src/services/tripLedger";

// The invariants from .audit/idempotency-audit.md, as pure functions over plain documents (what
// a `find` returns), so they can be tested without a database. Each returns problems in plain
// words; ids appear only as short suffixes so a problem can be found again.

type Id = { toString(): string };
const s = (v: Id | null | undefined): string | null => (v == null ? null : String(v));
const short = (v: Id | null | undefined): string => (v == null ? "none" : `…${String(v).slice(-6)}`);
const rupees = (paise: number): string => `₹${(paise / 100).toFixed(2)}`;

export type AccountDoc = { _id: Id; userId: Id; name?: string; type: string; balance: number; startingBalance?: number; isArchived?: boolean };
export type TxnDoc = {
    _id: Id; userId: Id; type: string; amount: number; account: Id; toAccount?: Id | null; category?: Id | null;
    occurredAt: Date | string; createdAt?: Date | string; splitGroupId?: Id | null; tripId?: Id | null; tripExpenseId?: Id | null;
    clientId?: string | null; title?: string | null; note?: string | null;
};
export type CategoryDoc = { _id: Id; userId: Id; name: string; kind: string; parent?: Id | null; isArchived?: boolean };
export type GoalDoc = { _id: Id; userId: Id; name?: string; target: number; saved: number; createdAt?: Date | string };
export type GoalLogDoc = { goalId: Id; amount: number };
export type BillDoc = { _id: Id; userId: Id; name?: string; account?: Id | null; category?: Id | null; toInvestment?: Id | null; pausedAt?: Date | null };
export type BudgetDoc = { _id: Id; userId: Id; category: Id; month: string };
export type TripDoc = { _id: Id; userId: Id; name?: string; members: Id[]; status: string; closedAt?: Date | string | null };
export type TripExpenseDoc = {
    _id: Id; userId: Id; tripId: Id; title: string; cost: number; occurredAt: Date | string; createdAt?: Date | string;
    category?: Id | null; paidBy?: Id | null; paidFrom?: Id | null; shares: { account?: Id | null; amount: number }[];
    source?: string; importKey?: string | null;
};
export type UserDoc = { _id: Id; email: string; prefs?: { defaultAccount?: Id | null } };

export type UserData = {
    user: UserDoc;
    accounts: AccountDoc[]; transactions: TxnDoc[]; categories: CategoryDoc[]; goals: GoalDoc[]; goalLogs: GoalLogDoc[];
    bills: BillDoc[]; budgets: BudgetDoc[]; trips: TripDoc[]; tripExpenses: TripExpenseDoc[];
};

export type Problem = { invariant: string; what: string };

/** The contribution log started on this day; older goals can't be checked against it. */
export const GOAL_LOG_SINCE = new Date("2026-09-20T00:00:00Z");

/** The balance change a row makes on each account it touches. */
export const effectsOf = (t: Pick<TxnDoc, "type" | "amount" | "account" | "toAccount">): [string, number][] => {
    const a = s(t.account), to = s(t.toAccount);
    switch (t.type) {
        case "expense": case "negativeAdjustment": return a ? [[a, -t.amount]] : [];
        case "income": case "positiveAdjustment": return a ? [[a, t.amount]] : [];
        case "transfer": return [...(a ? [[a, -t.amount] as [string, number]] : []), ...(to ? [[to, t.amount] as [string, number]] : [])];
        default: return [];
    }
};

const time = (d: Date | string | null | undefined): number => (d == null ? NaN : new Date(d).getTime());

export const checkUser = (d: UserData): Problem[] => {
    const out: Problem[] = [];
    const add = (invariant: string, what: string) => out.push({ invariant, what });
    const accounts = new Map(d.accounts.map((a) => [String(a._id), a]));
    const categories = new Map(d.categories.map((c) => [String(c._id), c]));

    // I1: a non-investment account's balance = starting balance + its rows.
    const sums = new Map<string, number>();
    for (const t of d.transactions) for (const [acc, delta] of effectsOf(t)) sums.set(acc, (sums.get(acc) ?? 0) + delta);
    for (const a of d.accounts) {
        if (a.type === "investment") continue;
        const expected = (a.startingBalance ?? 0) + (sums.get(String(a._id)) ?? 0);
        if (a.balance !== expected) add("I1", `${a.type} "${a.name}" ${short(a._id)}${a.isArchived ? " (archived)" : ""}: balance ${rupees(a.balance)}, starting balance + rows ${rupees(expected)} (gap ${rupees(a.balance - expected)})`);
    }

    // I2: a split group is one expense plus transfers out of the same account at the same instant.
    const groups = new Map<string, TxnDoc[]>();
    for (const t of d.transactions) if (t.splitGroupId) {
        const k = String(t.splitGroupId);
        groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    for (const [g, rows] of groups) {
        const expenses = rows.filter((t) => t.type === "expense");
        const others = rows.filter((t) => t.type !== "expense" && t.type !== "transfer");
        if (expenses.length !== 1 || others.length) add("I2", `split ${short(g)}: ${expenses.length} expenses and ${others.length} other rows (expected 1 expense, the rest transfers)`);
        if (new Set(rows.map((t) => s(t.account))).size > 1) add("I2", `split ${short(g)}: rows come from different accounts`);
        if (new Set(rows.map((t) => time(t.occurredAt))).size > 1) add("I2", `split ${short(g)}: rows are on different dates`);
    }

    // I3: a trip expense's rows = planLedger(expense); payer and shares are on the trip.
    const trips = new Map(d.trips.map((t) => [String(t._id), t]));
    const rowsByExpense = new Map<string, TxnDoc[]>();
    for (const t of d.transactions) if (t.tripExpenseId) {
        const k = String(t.tripExpenseId);
        rowsByExpense.set(k, [...(rowsByExpense.get(k) ?? []), t]);
    }
    const sig = (r: { type: string; amount: number; account: Id | string; toAccount?: Id | string | null }) => `${r.type}|${r.amount}|${s(r.account)}|${s(r.toAccount ?? null) ?? ""}`;
    for (const e of d.tripExpenses) {
        const trip = trips.get(String(e.tripId));
        if (!trip) { add("I6", `trip expense "${e.title}" ${short(e._id)} belongs to a missing trip`); continue; }
        const planned = planLedger({
            title: e.title, occurredAt: new Date(e.occurredAt), category: s(e.category ?? null), cost: e.cost,
            paidBy: s(e.paidBy ?? null), paidFrom: s(e.paidFrom ?? null), shares: e.shares.map((x) => ({ account: s(x.account ?? null), amount: x.amount })),
        }).map(sig).sort();
        const actual = (rowsByExpense.get(String(e._id)) ?? []).map(sig).sort();
        if (planned.join(",") !== actual.join(",")) add("I3", `trip expense "${e.title}" ${short(e._id)}: ${actual.length} rows don't match the ${planned.length} its split calls for`);
        const members = new Set(trip.members.map(String));
        const people = [e.paidBy, ...e.shares.map((x) => x.account)].filter((x): x is Id => x != null).map(String);
        if (people.some((p) => !members.has(p))) add("I3", `trip expense "${e.title}" ${short(e._id)}: a payer or share is not on the trip`);
    }

    // I4: a closed trip takes no new expenses, and each person is let go at most once per close.
    for (const trip of d.trips) {
        if (trip.status === "closed" && trip.closedAt) {
            const after = d.tripExpenses.filter((e) => String(e.tripId) === String(trip._id) && time(e.createdAt) > time(trip.closedAt) + 1_000);
            if (after.length) add("I4", `closed trip "${trip.name}" ${short(trip._id)} has ${after.length} expenses added after it closed`);
        }
        const letGos = d.transactions.filter((t) => String(t.tripId) === String(trip._id) && !t.tripExpenseId && t.type !== "transfer" && !t.clientId?.startsWith("plan:"));
        const byPerson = new Map<string, TxnDoc[]>();
        for (const t of letGos) byPerson.set(String(t.account), [...(byPerson.get(String(t.account)) ?? []), t]);
        for (const [person, rows] of byPerson) {
            const sorted = rows.map((t) => time(t.createdAt)).sort((a, b) => a - b);
            for (let i = 1; i < sorted.length; i += 1) if (sorted[i] - sorted[i - 1] < 10_000) {
                add("I4", `trip "${trip.name}" ${short(trip._id)}: person ${short(person)} was let go twice within 10 seconds`);
                break;
            }
        }
    }

    // I5: goal saved = min(target, Σ contributions logged), for goals made since the log exists.
    const logged = new Map<string, number>();
    for (const l of d.goalLogs) logged.set(String(l.goalId), (logged.get(String(l.goalId)) ?? 0) + l.amount);
    for (const g of d.goals) {
        if (!(time(g.createdAt) >= GOAL_LOG_SINCE.getTime())) continue;
        const expected = Math.min(g.target, logged.get(String(g._id)) ?? 0);
        if (g.saved !== expected) add("I5", `goal "${g.name}" ${short(g._id)}: saved ${rupees(g.saved)}, its contributions say ${rupees(expected)}`);
    }

    // I6: no reference to a missing, someone else's or archived record.
    const ownAccount = (id: Id | null | undefined, allowArchived: boolean): string | null => {
        if (id == null) return null;
        const a = accounts.get(String(id));
        if (!a) return "missing or someone else's";
        if (!allowArchived && a.isArchived) return "archived";
        return null;
    };
    const ownCategory = (id: Id | null | undefined, allowArchived: boolean): string | null => {
        if (id == null) return null;
        const c = categories.get(String(id));
        if (!c) return "missing or someone else's";
        if (!allowArchived && c.isArchived) return "archived";
        return null;
    };
    for (const t of d.transactions) {
        // Old rows may point at an archived account or category; that is what archiving keeps.
        for (const [label, why] of [["account", ownAccount(t.account, true)], ["destination", ownAccount(t.toAccount, true)], ["category", ownCategory(t.category, true)]] as const) {
            if (why) add("I6", `${t.type} ${short(t._id)}: its ${label} is ${why}`);
        }
    }
    for (const b of d.bills) {
        // A SIP paused when its holding was archived (gaps row 6) may keep pointing at it.
        for (const [label, why] of [["account", ownAccount(b.account, false)], ["investment", ownAccount(b.toInvestment, !!b.pausedAt)], ["category", ownCategory(b.category, false)]] as const) {
            if (why) add("I6", `bill "${b.name}" ${short(b._id)}: its ${label} is ${why}`);
        }
    }
    for (const b of d.budgets) {
        const why = ownCategory(b.category, true);
        if (why) add("I6", `budget ${b.month} ${short(b._id)}: its category is ${why}`);
    }
    {
        const why = ownAccount(d.user.prefs?.defaultAccount ?? null, false);
        if (why) add("I6", `the default account is ${why}`);
    }
    for (const trip of d.trips) for (const m of trip.members) {
        const why = ownAccount(m, true);
        if (why) add("I6", `trip "${trip.name}" ${short(trip._id)}: member ${short(m)} is ${why}`);
    }
    for (const c of d.categories) {
        if (!c.parent) continue;
        const p = categories.get(String(c.parent));
        if (!p) add("I6", `category "${c.name}" ${short(c._id)}: its parent is missing or someone else's`);
        else if (p.isArchived && !c.isArchived) add("I6", `category "${c.name}" ${short(c._id)} is live under the archived "${p.name}"`);
    }

    // I7: one live category per kind, parent and name.
    const seen = new Map<string, number>();
    for (const c of d.categories) if (!c.isArchived) {
        const k = `${c.kind}|${s(c.parent ?? null) ?? ""}|${c.name.trim().toLowerCase()}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (const [k, n] of seen) if (n > 1) add("I7", `${n} live ${k.split("|")[0]} categories named "${k.split("|")[2]}" under the same parent`);

    // I14: each Splitwise row imported at most once per trip. Parts of one row and entries it was
    // applied to legitimately share a key; identical copies do not.
    const copies = new Map<string, number>();
    for (const e of d.tripExpenses) if (e.importKey) {
        const k = `${String(e.tripId)}|${e.importKey}|${e.title}|${e.cost}|${time(e.occurredAt)}|${e.source}`;
        copies.set(k, (copies.get(k) ?? 0) + 1);
    }
    for (const [k, n] of copies) if (n > 1) add("I14", `trip ${short(k.split("|")[0])}: the Splitwise row "${k.split("|")[2]}" was imported ${n} times`);

    // I15: a holding never goes below zero.
    for (const a of d.accounts) if (a.type === "investment" && a.balance < 0) add("I15", `holding "${a.name}" ${short(a._id)} is below zero (${rupees(a.balance)})`);

    return out;
};

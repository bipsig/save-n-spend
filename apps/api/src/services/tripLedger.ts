// How a trip turns into ordinary transactions, and back into balances. Pure, so it can be
// tested without a database.
//
// The rule the whole feature rests on: your spending is YOUR SHARE, whoever paid.
//
//   you paid ₹4,000, split 4   → expense ₹1,000 from your account (your share)
//                                + a transfer of ₹1,000 to each friend (what they now owe you)
//   Rahul paid ₹2,000, split 4 → expense ₹500 charged to Rahul's person account
//                                (your share; his balance going negative = you owe him)
//   anyone settles             → a transfer between you and them — never spending
//
// Every one of these carries the trip's id. A friend's balance on the trip is then simply what
// the trip's transactions did to their person account.

import { createHash } from "crypto";

export type Id = string;

export type ShareIn = { account: Id | null; amount: number };

export type TripExpenseIn = {
    title: string;
    occurredAt: Date;
    category: Id | null;
    cost: number;
    /** null = you paid. */
    paidBy: Id | null;
    /** Your account, when you paid. */
    paidFrom: Id | null;
    shares: ShareIn[];
};

export type LedgerRow = {
    type: "expense" | "transfer" | "positiveAdjustment" | "negativeAdjustment";
    amount: number;
    account: Id;
    toAccount?: Id;
    category?: Id | null;
    title?: string;
    note?: string;
    occurredAt: Date;
    /** Set by an import: the row's fingerprint, so importing the same file again skips it. */
    clientId?: string;
};

/** What's wrong with an expense, or null if it's sound. `members` are the trip's people. */
export const validateTripExpense = (e: TripExpenseIn, members: Id[]): string | null => {
    if (!Number.isInteger(e.cost) || e.cost <= 0) return "Enter the amount";
    if (e.shares.length === 0) return "Pick who it's split between";
    const memberSet = new Set(members);
    const seen = new Set<string>();
    for (const s of e.shares) {
        if (!Number.isInteger(s.amount) || s.amount < 0) return "Each share must be zero or more";
        const key = s.account ?? "me";
        if (seen.has(key)) return "Someone is in the split twice";
        seen.add(key);
        if (s.account !== null && !memberSet.has(s.account)) return "Everyone in the split must be on the trip";
    }
    const total = e.shares.reduce((sum, s) => sum + s.amount, 0);
    if (total !== e.cost) return "The shares must add up to the amount";
    if (e.paidBy === null && !e.paidFrom) return "Pick the account you paid from";
    if (e.paidBy !== null && !memberSet.has(e.paidBy)) return "Whoever paid must be on the trip";
    return null;
};

/** Your share of an expense — what counts as your spending. */
export const myShareOf = (shares: ShareIn[]): number =>
    shares.find((s) => s.account === null)?.amount ?? 0;

/** The transactions an expense stands for. See the rule at the top. */
export const planLedger = (e: TripExpenseIn): LedgerRow[] => {
    const rows: LedgerRow[] = [];
    const mine = myShareOf(e.shares);

    if (e.paidBy === null) {
        const from = e.paidFrom as Id;
        if (mine > 0) rows.push({ type: "expense", amount: mine, account: from, category: e.category, title: e.title, occurredAt: e.occurredAt });
        for (const s of e.shares) {
            if (s.account !== null && s.amount > 0) {
                rows.push({ type: "transfer", amount: s.amount, account: from, toAccount: s.account, note: e.title, occurredAt: e.occurredAt });
            }
        }
    }
    // A friend paid: only your share involves you. What the others owe the payer is theirs.
    else if (mine > 0) {
        rows.push({ type: "expense", amount: mine, account: e.paidBy, category: e.category, title: e.title, occurredAt: e.occurredAt });
    }
    return rows;
};

/** Splits `cost` evenly across `count` people, to the paisa — the remainder goes to the
 *  first few so the shares always add up exactly. */
export const splitEvenly = (cost: number, count: number): number[] => {
    if (count <= 0) return [];
    const base = Math.floor(cost / count);
    const extra = cost - base * count;
    return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
};

export type TripTxn = {
    type: string;
    amount: number;
    account: Id;
    toAccount?: Id | null;
};

/** Each member's trip balance: positive = they owe you, negative = you owe them. It's exactly
 *  what the trip's transactions did to their person account. */
export const memberBalances = (txns: TripTxn[], members: Id[]): Map<Id, number> => {
    const out = new Map<Id, number>(members.map((m) => [m, 0]));
    const bump = (id: Id | null | undefined, delta: number) => {
        if (id && out.has(id)) out.set(id, (out.get(id) as number) + delta);
    };
    for (const t of txns) {
        if (t.type === "transfer") {
            bump(t.toAccount, t.amount);
            bump(t.account, -t.amount);
        }
        else if (t.type === "expense" || t.type === "negativeAdjustment") bump(t.account, -t.amount);
        else if (t.type === "positiveAdjustment") bump(t.account, t.amount);
    }
    return out;
};

/** A settle-up as a transfer. `received`: they paid you, into `myAccount`. `paid`: you paid
 *  them, from `myAccount`. */
export const planSettlement = (
    person: Id, myAccount: Id, amount: number, direction: "received" | "paid", occurredAt: Date, note: string,
): LedgerRow => (direction === "received"
    ? { type: "transfer", amount, account: person, toAccount: myAccount, note, occurredAt }
    : { type: "transfer", amount, account: myAccount, toAccount: person, note, occurredAt });

/** Clearing a leftover balance at close without anyone paying.
 *  They owed you: it becomes part of your share (an expense charged to them — you effectively
 *  paid it). You owed them: a balance correction — the app has no negative spending, so your
 *  share stays as it was (off by at most the small amount, as agreed). */
export const planLetGo = (person: Id, name: string, balance: number, occurredAt: Date): LedgerRow | null => {
    if (balance > 0) return { type: "expense", amount: balance, account: person, category: null, title: `Let go: ${name}`, occurredAt };
    if (balance < 0) return { type: "positiveAdjustment", amount: -balance, account: person, note: `Let go: ${name}`, occurredAt };
    return null;
};

// ---- Matching what Splitwise tells people to pay -------------------------------------------
//
// With "simplify debts" on, Splitwise re-routes who pays whom: Jai's debt to you can become
// Phani paying you more, with Jai paying someone else instead. Each person's EXACT balance (what
// the ledger says between you and them) then differs from what they will actually pay. The
// plan is that second set of numbers, typed in from Splitwise. It re-routes balances between
// the people on the trip and never changes the total — so it is stored as paired balance
// adjustments on the person accounts, which adds up to zero.

/** Keys the plan's adjustment rows, so saving again replaces them rather than stacking. */
export const PLAN_PREFIX = "plan:";
export const rerouteKey = (tripId: Id, person: Id): string => `${PLAN_PREFIX}${tripId}:${person}`;
export const isReroute = (t: { clientId?: string | null }): boolean => !!t.clientId?.startsWith(PLAN_PREFIX);

export type PlanEntry = { account: Id; amount: number };

/** What's wrong with a plan, or null. `exact` is each member's balance without any re-routing.
 *  Anyone left out of `entries` pays ₹0, as Splitwise lists only the people who still owe. */
export const validatePlan = (entries: PlanEntry[], members: Id[], exact: Map<Id, number>): string | null => {
    const memberSet = new Set(members);
    const seen = new Set<Id>();
    for (const e of entries) {
        if (!memberSet.has(e.account)) return "Everyone in the plan must be on the trip";
        if (seen.has(e.account)) return "Someone is in the plan twice";
        seen.add(e.account);
        if (!Number.isInteger(e.amount)) return "Amounts must be whole paise";
    }
    const entered = entries.reduce((sum, e) => sum + e.amount, 0);
    const total = [...exact.values()].reduce((sum, v) => sum + v, 0);
    if (entered !== total) return "The amounts must add up to what you're owed overall";
    return null;
};

/** The adjustments that move each person's balance from exact to the plan. A person owing
 *  more than their exact share gets a positive one, owing less a negative one; together they
 *  net to zero. */
export const planReroute = (
    tripId: Id, entries: PlanEntry[], exact: Map<Id, number>, occurredAt: Date,
): LedgerRow[] => {
    const target = new Map(entries.map((e) => [e.account, e.amount]));
    const rows: LedgerRow[] = [];
    for (const [person, was] of exact) {
        const delta = (target.get(person) ?? 0) - was;
        if (delta === 0) continue;
        rows.push({
            type: delta > 0 ? "positiveAdjustment" : "negativeAdjustment",
            amount: Math.abs(delta),
            account: person,
            note: "Matched to Splitwise",
            occurredAt,
            clientId: rerouteKey(tripId, person),
        });
    }
    return rows;
};

/** A fingerprint of a trip's expenses. A plan saved against one fingerprint is stale once
 *  expenses are added, removed or changed. Settle-ups are deliberately not part of it — they
 *  move the exact and the planned balance by the same amount. */
export const expensesSignature = (
    expenses: { id: Id; cost: number; paidBy: Id | null; shares: ShareIn[] }[],
): string => {
    const lines = expenses
        .map((e) => `${e.id}|${e.cost}|${e.paidBy ?? "me"}|${e.shares.map((s) => `${s.account ?? "me"}:${s.amount}`).sort().join(",")}`)
        .sort();
    return createHash("sha1").update(lines.join("\n")).digest("hex");
};

/** Whether Splitwise's simplification could have changed anything after an import: some
 *  person's exact balance differs from what they owe the group overall (the file's own
 *  "Total balance" line). If every one matches, the plan would equal the exact numbers and
 *  there's nothing to ask. Without that line there's no way to tell, so no prompt — the
 *  button on the trip page is still there. */
export const simplifyMayMatter = (
    totals: Record<string, number> | null,
    exact: Map<Id, number>,
    accountOf: Record<string, Id | null>,
    tolerance = 100,
): boolean => {
    if (!totals) return false;
    for (const [name, account] of Object.entries(accountOf)) {
        if (!account || !(name in totals) || !exact.has(account)) continue;
        // In the file a negative total is a debt to the group; for you that is a positive balance.
        if (Math.abs((exact.get(account) as number) - -totals[name]) > tolerance) return true;
    }
    return false;
};

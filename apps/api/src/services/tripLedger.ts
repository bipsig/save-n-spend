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

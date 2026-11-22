import mongoose, { type ClientSession } from "mongoose";
import { ITransaction } from "../models/Transaction";
import Account, { type IAccount } from "../models/Account";
import { AppError } from "../utils/AppError";
import { createTransactionSchema, type TransactionPatch } from "../schemas/transactionSchema";

type Effect = {
    account: mongoose.Types.ObjectId,
    delta: number
}

/** What a row's balance effect depends on. */
export type Movable = Pick<ITransaction, "type" | "amount" | "account" | "toAccount" | "userId">;

export const REDEEM_TOO_MUCH = "You can't redeem more than this holding is worth. Update its value first if it has grown";

export const getEffectOf = (transaction: Movable): Effect[] => {

    switch (transaction.type) {
        case "expense":
        case "negativeAdjustment":
            return [{ account: transaction.account, delta: -transaction.amount }]

            case "income":
            case "positiveAdjustment":
            return [{ account: transaction.account, delta: transaction.amount }]

        case "transfer":
            return [
                { account: transaction.account, delta: -transaction.amount },
                { account: transaction.toAccount!, delta: transaction.amount }
            ]

        default:
            return [];
    }
}

/**
 * Moves the balances a row stands for (`add`) or takes them back (`revert`).
 *
 * `noOverdraw` lists accounts a decrease may not take below zero — a holding a redemption comes
 * out of. The check is in the update's filter, so two redemptions at once can't both pass it.
 */
export const applyEffects = async (
    transaction: Movable,
    action: "add" | "revert",
    session: mongoose.ClientSession,
    { noOverdraw = [] }: { noOverdraw?: string[] } = {},
): Promise<void> => {
    const direction = action === "add" ? 1 : -1;
    
    const effects = getEffectOf(transaction);
    for (const { account, delta } of effects) {
        const change = direction * delta;
        const floored = change < 0 && noOverdraw.includes(String(account));
        const { matchedCount } = await Account.updateOne(
            { _id: account, userId: transaction.userId, ...(floored ? { balance: { $gte: -change } } : {}) },
            { $inc: { balance: change }},
            { session }
        );
        if (matchedCount === 1) continue;
        if (floored && (await Account.exists({ _id: account, userId: transaction.userId }).session(session))) {
            throw AppError.badRequest(REDEEM_TOO_MUCH);
        }
        // Taking a row off an account that no longer exists has no balance to undo, so it
        // stays allowed (older data holds such rows). Anything else — a new effect on a
        // missing account, or any effect on another user's — rolls the whole write back.
        if (action === "revert" && !(await Account.exists({ _id: account }).session(session))) continue;
        throw AppError.invalidReference("account", "The account", "accounts");
    }
}

/**
 * The user's live accounts among `refs`, read in the session, or a 400 `invalid_reference`
 * naming the first field (`path`) whose account is missing, someone else's, archived or not of
 * `types`.
 */
export const requireLiveAccounts = async (
    userId: string,
    refs: { path: string; id: string; label: string; things: string; types?: string[] }[],
    session: ClientSession,
): Promise<Map<string, IAccount>> => {
    const ids = [...new Set(refs.map((r) => r.id.toLowerCase()))];
    const found = await Account.find({ _id: { $in: ids }, userId, isArchived: false }).session(session);
    const byId = new Map(found.map((a) => [String(a._id), a]));
    for (const ref of refs) {
        const a = byId.get(ref.id.toLowerCase());
        if (!a || (ref.types && !ref.types.includes(a.type))) throw AppError.invalidReference(ref.path, ref.label, ref.things);
    }
    return byId;
};

/** A stored row as the create schema reads it: ids as text, the moment as ISO text, and
 *  only the fields its type takes. */
const asSent = (row: ITransaction): Record<string, unknown> => {
    const out: Record<string, unknown> = { type: row.type, amount: row.amount, account: String(row.account), occurredAt: row.occurredAt.toISOString() };
    if (row.type === "transfer" && row.toAccount) out.toAccount = String(row.toAccount);
    if ((row.type === "expense" || row.type === "income") && row.category) out.category = String(row.category);
    // A transfer takes no title (a bill-paid SIP transfer stores one), so none is sent for it.
    const keys = row.type === "transfer" ? (["note", "location", "receiptUrl", "paymentMode"] as const) : (["title", "note", "location", "receiptUrl", "paymentMode"] as const);
    for (const key of keys) {
        if (row[key] !== null && row[key] !== undefined && row[key] !== "") out[key] = row[key];
    }
    return out;
};

/**
 * What an edit changes, after checking the edited row against the rules a new row of its type
 * must meet (gaps row 29): a transfer can't gain a category or end up on one account twice, an
 * expense can't gain a `toAccount`. Throws the create schema's ZodError (400) when it doesn't.
 * Pure: reference checks are the caller's.
 */
export const editedFields = (row: ITransaction, patch: TransactionPatch): Record<string, unknown> => {
    createTransactionSchema.parse({ ...asSent(row), ...patch });
    const set: Record<string, unknown> = { ...patch };
    if (patch.occurredAt !== undefined) set.occurredAt = new Date(patch.occurredAt);
    return set;
};

/** Whether `set` changes the stored value of `key` (ids and dates compared by value). */
export const changes = (row: ITransaction, set: Record<string, unknown>, key: keyof ITransaction & string): boolean => {
    if (!(key in set)) return false;
    const before = row[key] as unknown;
    const after = set[key];
    if (before instanceof Date && after instanceof Date) return before.getTime() !== after.getTime();
    return String(before ?? "").toLowerCase() !== String(after ?? "").toLowerCase();
};

/**
 * Gaps row 30, decided as "re-split": when a split expense is edited, each person's owed
 * transfer follows it. The expense's `amount` is the user's own share, so a new share scales
 * every owed amount by the same factor, which keeps each person's proportion of the bill; a
 * new account or moment moves every transfer with it (a split is one event, I2); a transfer
 * whose note was the old title takes the new one, as createTransaction names them.
 *
 * Returns each transfer's `$set` (empty when nothing about it changes). Pure.
 */
export const resplit = (
    expense: Pick<ITransaction, "amount" | "account" | "occurredAt" | "title">,
    set: Record<string, unknown>,
    transfers: Pick<ITransaction, "amount" | "note">[],
): Record<string, unknown>[] => {
    const share = typeof set.amount === "number" ? set.amount : expense.amount;
    return transfers.map((t) => {
        const next: Record<string, unknown> = {};
        if (share !== expense.amount) {
            // At least a paisa: a transfer of zero would be a row that says nothing.
            const amount = Math.max(1, Math.round((t.amount * share) / expense.amount));
            if (amount !== t.amount) next.amount = amount;
        }
        // Only what the edit changes: the app sends the moment back on every save, and a group
        // already spread over two days (older data) stays as it is unless the date moves.
        if (set.account !== undefined && String(set.account).toLowerCase() !== String(expense.account).toLowerCase()) next.account = set.account;
        if (set.occurredAt instanceof Date && set.occurredAt.getTime() !== expense.occurredAt.getTime()) next.occurredAt = set.occurredAt;
        if (typeof set.title === "string" && set.title !== expense.title && (t.note ?? null) === (expense.title ?? null)) next.note = set.title;
        return next;
    });
};

import { ClientSession } from "mongoose";
import Account, { type IAccount } from "../models/Account";
import Category from "../models/Category";
import { AppError } from "../utils/AppError";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export type CategoryKind = "expense" | "income";

/** The categories a row of `kind` may be filed under (gaps row 18): the user's own, of that
 *  kind, and with `live` not archived. An edit that keeps a row's archived category passes
 *  `live: false`, so an old row stays editable. */
export const categoryQuery = (userId: unknown, kind: CategoryKind, live: boolean) =>
    ({ userId, kind, ...(live ? { isArchived: false } : {}) });

/** Every reference to a category goes through this: transactions, bills, budgets, trip
 *  expenses and the Splitwise import. A 400 `invalid_reference` on `path` otherwise. */
export const requireCategory = async (
    userId: string,
    id: string,
    { kind, live, path = "category", session = null }: { kind: CategoryKind; live: boolean; path?: string; session?: ClientSession | null },
): Promise<void> => {
    const ok = OBJECT_ID.test(id) && (await Category.exists({ _id: id, ...categoryQuery(userId, kind, live) }).session(session));
    if (!ok) throw AppError.invalidReference(path, "Category", "categories");
};

/** Whether an edit leaves the category it already had (ids compared as text). */
export const keepsCategory = (before: unknown, after: unknown): boolean =>
    before != null && after != null && String(before).toLowerCase() === String(after).toLowerCase();

/** Loads every id in one query scoped to the user, or throws a 400 naming the first id that
 *  is malformed, missing, someone else's, archived (with `live`) or of another type. */
export const requireOwnedAccounts = async (
    userId: string,
    ids: string[],
    opts: { types?: string[]; live?: boolean; session?: ClientSession } = {},
): Promise<Map<string, IAccount>> => {
    const unique = [...new Set(ids.map(String))];
    const malformed = unique.find((id) => !OBJECT_ID.test(id));
    if (malformed !== undefined) throw AppError.badRequest(`Invalid account id: ${malformed}`);
    if (unique.length === 0) return new Map();

    const found = await Account.find({
        _id: { $in: unique },
        userId,
        ...(opts.types ? { type: { $in: opts.types } } : {}),
        ...(opts.live ? { isArchived: false } : {}),
    }).session(opts.session ?? null);
    const byId = new Map(found.map((a) => [String(a._id), a]));
    const bad = unique.find((id) => !byId.has(id.toLowerCase()));
    if (bad !== undefined) {
        throw AppError.badRequest(opts.types?.length === 1 && opts.types[0] === "person"
            ? `Not one of your people: ${bad}`
            : `Not one of your accounts: ${bad}`);
    }
    return byId;
};

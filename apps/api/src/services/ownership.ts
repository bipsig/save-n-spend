import { ClientSession } from "mongoose";
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

import type { Model, SortOrder } from "mongoose";
import type { Paginated } from "@save-n-spend/types";

/** The page shape, from one page of rows and the count of every match. `page` is 1-based. */
export const pageOf = <T>(items: T[], page: number, limit: number, total: number): Paginated<T> =>
    ({ items, page, limit, hasNextPage: page * limit < total, total });

/**
 * One page of `filter`, newest first by `sort`. Ties are broken on `_id` (the order they were
 * saved), so a row can't show on two pages or on none.
 *
 * shortcut: the `_id` tie-break isn't in any index, so MongoDB sorts the user's matches in
 * memory; fine at thousands of rows per user, add `{userId, <sort field>, _id}` indexes past that.
 */
export const paginate = async <T>(
    model: Model<T>,
    filter: Record<string, unknown>,
    { page, limit, sort, lean = false }: { page: number; limit: number; sort: Record<string, SortOrder>; lean?: boolean },
): Promise<Paginated<T>> => {
    const query = model.find(filter).sort({ ...sort, _id: 1 }).skip((page - 1) * limit).limit(limit);
    const [items, total] = await Promise.all([lean ? query.lean<T[]>() : query, model.countDocuments(filter)]);
    return pageOf(items as T[], page, limit, total);
};

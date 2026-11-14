import { ClientSession } from "mongoose";
import Account, { type IAccount } from "../models/Account";
import { AppError } from "../utils/AppError";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

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

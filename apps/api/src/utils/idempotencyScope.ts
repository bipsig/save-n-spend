import { AsyncLocalStorage } from "async_hooks";
import type { ClientSession } from "mongoose";
import IdempotencyRecord from "../models/IdempotencyRecord";
import { AppError } from "./AppError";
import { MESSAGES } from "./messages";

/** The claimed record of the request being handled, for `inTransaction` to mark. */
export type IdempotencyScope = {
    recordId: unknown;
    attempt: string;
    /** A transaction of this request has committed (and with it, the marker). */
    committed: boolean;
    /** The reply is being stored; transactions started from here on are not this request's write. */
    finished: boolean;
};

const storage = new AsyncLocalStorage<IdempotencyScope>();

export const runInScope = <T>(scope: IdempotencyScope, fn: () => T): T => storage.run(scope, fn);

export const currentScope = (): IdempotencyScope | null => {
    const scope = storage.getStore();
    return scope && !scope.finished ? scope : null;
};

/**
 * Inside the write's transaction: records that this key's write is landing. Matches nothing
 * when a retry has taken the claim over, and then aborts the write, so one key commits once.
 */
export const markCommitted = async (scope: IdempotencyScope, session: ClientSession): Promise<void> => {
    const { matchedCount } = await IdempotencyRecord.updateOne(
        { _id: scope.recordId, attempt: scope.attempt },
        { $set: { committed: true } },
        { session },
    );
    if (matchedCount !== 1) throw new AppError(409, MESSAGES.idempotencyInProgress, { code: "idempotency_in_progress" });
};

import mongoose, { type ClientSession } from "mongoose";

/**
 * Runs `fn` in one MongoDB transaction and returns what it returns.
 *
 * Built on `mongoose.connection.transaction()`, which retries on a transient error (a write
 * conflict) and resets the state of documents changed inside, so a retry starts clean.
 *
 * The rule: load every document you change INSIDE `fn`, with `{ session }`. A document loaded
 * before `fn` and changed inside it keeps the first attempt's changes when MongoDB retries, and
 * the retry then writes from that stale copy (the idempotency audit's N2: balances that stop
 * matching their rows). Prefer conditional writes (`findOneAndUpdate` with the state you
 * expect in the filter) over read-change-save.
 */
export const inTransaction = <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> =>
    mongoose.connection.transaction(fn);

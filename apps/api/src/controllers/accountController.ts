import { Request, Response } from "express"
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { applyEffects } from "../services/transactionService";
import * as reply from "../utils/response";
import { createAccountSchema, reorderSchema, syncAccountBalanceSchema, updateAccountSchema } from "../schemas/accountSchema";

export const listAccounts = async (req: Request, res: Response): Promise<void> => {
    // createdAt breaks the ties every account starts on, keeping a list nobody has reordered
    // in the order it was built.
    const accounts = await Account.find({
        userId: req.user?.userId,
        isArchived: false
    }).sort({ order: 1, createdAt: 1 });

    reply.ok(res, accounts, "Accounts fetched successfully");
}

export const createAccount = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createAccountSchema.parse(req.body);

    // Lands last rather than at 0, which on a list the user has already ordered would put
    // their newest account at the top.
    const existing = await Account.countDocuments({
        userId: req.user?.userId,
        isArchived: false
    });

    // An investment can start worth something other than what went in — the gain or loss
    // made before it was tracked here. `startingBalance` stays the cost basis and `balance`
    // is today's value; the gap is that pre-tracking gain, not a movement this month, so
    // it's stored directly rather than as a value-update.
    const investment = reqBody.type === "investment";
    const savedAccount = await Account.create({
        userId: req.user?.userId,
        name: reqBody.name,
        type: reqBody.type,
        balance: investment && reqBody.currentValue !== undefined ? reqBody.currentValue : reqBody.startingBalance,
        startingBalance: reqBody.startingBalance,
        icon: reqBody.icon ?? "wallet",
        color: reqBody.color ?? "success",
        investmentKind: reqBody.investmentKind,
        ...(investment ? { investedSince: reqBody.investedSince ?? null, investedHow: reqBody.investedHow ?? null } : {}),
        order: existing
    });

    reply.created(res, savedAccount, "Account created successfully");
}

/**
 * Writes the user's whole account list in the order given. The request must carry every live
 * account: a partial list would leave the ones it omits on numbers that collide with the ones
 * it sets, and the result would fall to the createdAt tiebreak rather than to what the user
 * just did.
 */
export const reorderAccounts = async (req: Request, res: Response): Promise<void> => {
    const { ids } = reorderSchema.parse(req.body);

    if (new Set(ids).size !== ids.length) {
        throw AppError.badRequest("The same account was listed twice");
    }

    const owned = await Account.countDocuments({
        _id: { $in: ids },
        userId: req.user?.userId,
        isArchived: false
    });

    if (owned !== ids.length) {
        throw AppError.badRequest("Some of those accounts no longer exist");
    }

    await Account.bulkWrite(ids.map((id, index) => ({
        updateOne: {
            filter: { _id: id, userId: req.user?.userId },
            update: { $set: { order: index } }
        }
    })));

    reply.ok(res, { reordered: ids.length }, "Accounts reordered");
}

export const getAccount = async (req: Request, res: Response): Promise<void> => {
    const { id: accountId } = req.params;

    const account = await Account.findOne({
        _id: accountId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) {
        throw AppError.notFound("Account not found");
    }

    reply.ok(res, account, "Account fetched successfully");
}

export const updateAccount = async (req: Request, res: Response): Promise<void> => {
    const { id: accountId } = req.params;
    const reqBody = updateAccountSchema.parse(req.body);

    const account = await Account.findOne({
        _id: accountId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) {
        throw AppError.notFound("Account not found");
    }

    Object.assign(account, reqBody);

    const updatedAccount = await account.save();

    reply.ok(res, updatedAccount, "Account details updated");
}

// Reconcile an account against the balance the bank actually reports.
//
// `balance` is a stored field kept in step with transactions by `applyEffects`, never
// recomputed, so it cannot simply be assigned: a bare `$set` leaves it disagreeing with the sum
// of the rows that produced it, and every later transaction `$inc`s from a figure with no
// history behind it.
//
// So a sync writes the DIFFERENCE as an adjustment transaction and lets the existing balance
// machinery apply it. Adjustments exist for exactly this — they move a balance and are excluded
// from income and expense everywhere those are computed, because correcting a figure is
// bookkeeping. The invariant survives, and the correction is dated and revertible.
export const syncAccountBalance = async (req: Request, res: Response): Promise<void> => {
    const { id: accountId } = req.params;
    const reqBody = syncAccountBalanceSchema.parse(req.body);

    const account = await Account.findOne({
        _id: accountId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) {
        throw AppError.notFound("Account not found");
    }

    const delta = reqBody.balance - account.balance;
    const now = new Date();

    // Already correct. Writing a zero-amount adjustment would put a row in the ledger
    // that says nothing, so only the timestamp moves — the user still checked, and that
    // is what the timestamp records.
    if (delta === 0) {
        account.lastSyncedAt = now;
        const stamped = await account.save();
        reply.ok(res, stamped, "Balance already matched");
        return;
    }

    let syncedAccount;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [adjustment] = await Transaction.create([{
                userId: req.user?.userId,
                type: delta > 0 ? "positiveAdjustment" : "negativeAdjustment",
                // Signed intent lives in the type; the amount is always a magnitude,
                // which is what the model's `min: 0` requires.
                amount: Math.abs(delta),
                account: account._id,
                title: reqBody.note ?? "Balance correction",
                occurredAt: now
            }], { session });

            await applyEffects(adjustment, "add", session);

            // Read back inside the session, after the $inc, so the response carries the
            // balance the user asked for rather than the one this request started with.
            syncedAccount = await Account.findOneAndUpdate(
                { _id: account._id },
                { $set: { lastSyncedAt: now } },
                { session, new: true }
            );
        });
    }
    finally {
        session.endSession();
    }

    reply.ok(res, syncedAccount, "Balance updated");
}

export const archiveAccount = async (req: Request, res: Response): Promise<void> => {
    const { id: accountId } = req.params;

    const account = await Account.findOne({
        _id: accountId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) {
        throw AppError.notFound("Account not found");
    }

    account.isArchived = true;

    await account.save();

    reply.ok(res, null, "Account deleted successfully");
}

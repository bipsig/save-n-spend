import { Request, Response } from "express"
import type { Valid } from "../middleware/validate";
import { AppError } from "../utils/AppError";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import * as reply from "../utils/response";
import { inTransaction } from "../utils/inTransaction";
import { conflict, notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";
import { detachAccount } from "../services/accountDetach";
import { accountIdRequest, createAccountRequest, reorderAccountsRequest, syncAccountBalanceRequest, updateAccountRequest } from "../schemas/accountSchema";
import { ifMatch, requireUnchanged } from "../utils/precondition";

const missing = () => AppError.notFound(notFound("account"));

export const listAccounts = async (req: Request, res: Response): Promise<void> => {
    // createdAt breaks the ties every account starts on, keeping a list nobody has reordered
    // in the order it was built.
    const accounts = await Account.find({
        userId: req.user?.userId,
        isArchived: false
    }).sort({ order: 1, createdAt: 1 });

    reply.ok(res, toDTOs(accounts), "Accounts fetched");
}

export const createAccount = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createAccountRequest>;

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
    const investment = body.type === "investment";
    // In a transaction so a sent Idempotency-Key is recorded with the account (utils/inTransaction).
    const [savedAccount] = await inTransaction((session) => Account.create([{
        userId: req.user?.userId,
        name: body.name,
        type: body.type,
        balance: investment && body.currentValue !== undefined ? body.currentValue : body.startingBalance,
        startingBalance: body.startingBalance,
        icon: body.icon ?? "wallet",
        color: body.color ?? "success",
        investmentKind: body.investmentKind,
        ...(investment ? { investedSince: body.investedSince ?? null, investedHow: body.investedHow ?? null } : {}),
        order: existing
    }], { session }));

    reply.created(res, toDTO(savedAccount), "Account created");
}

/**
 * Writes the user's whole account list in the order given. The request must carry every live
 * account: a partial list would leave the ones it omits on numbers that collide with the ones
 * it sets, and the result would fall to the createdAt tiebreak rather than to what the user
 * just did.
 */
export const reorderAccounts = async (req: Request, res: Response): Promise<void> => {
    const { ids } = (req.valid as Valid<typeof reorderAccountsRequest>).body;

    if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
        throw AppError.badRequest("An account is in the list twice");
    }

    const owned = await Account.countDocuments({
        _id: { $in: ids },
        userId: req.user?.userId,
        isArchived: false
    });

    if (owned !== ids.length) {
        throw AppError.invalidReference("ids", "An account in the list", "accounts");
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
    const { id } = (req.valid as Valid<typeof accountIdRequest>).params;

    const account = await Account.findOne({
        _id: id,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) throw missing();

    reply.ok(res, toDTO(account), "Account fetched");
}

export const updateAccount = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof updateAccountRequest>;
    const since = ifMatch(req);

    const account = await Account.findOne({
        _id: id,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!account) throw missing();
    requireUnchanged(account, since);

    // A holding's balance is its value, not starting balance + rows (it can carry an opening
    // gain) and can't go below zero; a person's is what they owe, and trips and splits only
    // take people (and pay only from your own accounts). Turning either into another type, or
    // another type into one, leaves a balance or a trip that breaks those rules. The app sends
    // the type back unchanged on every save; that stays allowed.
    if (body.type !== undefined && body.type !== account.type) {
        const fixed = [body.type, account.type].includes("investment") ? "an investment" : [body.type, account.type].includes("person") ? "a person" : null;
        if (fixed) {
            const message = `An account can't be turned into ${fixed} or back. Add a new one instead`;
            throw new AppError(400, message, { issues: [{ path: "type", message }] });
        }
    }

    // Gaps row 194: only a holding has an investment type. The edit sheet sends it only for one.
    if (body.investmentKind !== undefined && (body.type ?? account.type) !== "investment") {
        throw new AppError(400, "Investment type is only for investments", { issues: [{ path: "investmentKind", message: "Investment type is only for investments" }] });
    }

    Object.assign(account, body);

    const updatedAccount = await account.save();

    reply.ok(res, toDTO(updatedAccount), "Account updated");
}

// Reconcile an account against the balance the bank actually reports.
//
// `balance` is a stored field kept in step with transactions by `applyEffects`, never
// recomputed, so it cannot simply be assigned: a bare `$set` leaves it disagreeing with the sum
// of the rows that produced it, and every later transaction `$inc`s from a figure with no
// history behind it.
//
// So a sync writes the DIFFERENCE as an adjustment transaction and moves the balance by it.
// Adjustments exist for exactly this — they move a balance and are excluded from income and
// expense everywhere those are computed, because correcting a figure is bookkeeping. The
// invariant survives, and the correction is dated and revertible.
//
// The difference is worked out from a balance read inside the transaction, and the write only
// lands if the balance is still that figure, so two syncs at once both end AT the target: the
// second is retried from the first one's result and finds nothing left to correct.
export const syncAccountBalance = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof syncAccountBalanceRequest>;
    const userId = req.user!.userId;

    const { account, matched } = await inTransaction(async (session) => {
        const current = await Account.findOne({ _id: id, userId, isArchived: false }).session(session);
        if (!current) throw missing();

        const delta = body.balance - current.balance;
        const now = new Date();

        // Already correct. A zero-amount adjustment would put a row in the ledger that says
        // nothing, so only the timestamp moves — the user still checked, and that is what the
        // timestamp records.
        if (delta !== 0) {
            await Transaction.create([{
                userId,
                type: delta > 0 ? "positiveAdjustment" : "negativeAdjustment",
                // Signed intent lives in the type; the amount is always a magnitude,
                // which is what the model's `min: 0` requires.
                amount: Math.abs(delta),
                account: current._id,
                title: body.note ?? "Balance correction",
                occurredAt: now
            }], { session });
        }

        const synced = await Account.findOneAndUpdate(
            { _id: current._id, userId, balance: current.balance },
            { $inc: { balance: delta }, $set: { lastSyncedAt: now } },
            { session, new: true },
        );
        if (!synced) throw AppError.conflict(conflict("This balance was just changed", "Check it and try again"));
        return { account: synced, matched: delta === 0 };
    });

    reply.ok(res, toDTO(account), matched ? "Balance confirmed" : "Balance updated");
}

// Allowed with money still in it (decision 3a, 22 Nov): the app's confirm names the amount.
export const archiveAccount = async (req: Request, res: Response): Promise<void> => {
    const { id } = (req.valid as Valid<typeof accountIdRequest>).params;
    const userId = req.user!.userId;

    await inTransaction(async (session) => {
        const archived = await Account.findOneAndUpdate(
            { _id: id, userId, isArchived: false },
            { $set: { isArchived: true } },
            { session },
        );
        if (!archived) throw missing();
        await detachAccount(userId, archived._id, "archive", session);
    });

    reply.ok(res, null, "Account archived");
}

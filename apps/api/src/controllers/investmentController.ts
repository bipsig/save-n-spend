import { Request, Response } from "express";
import mongoose from "mongoose";
import * as reply from "../utils/response";
import { AppError } from "../utils/AppError";
import { resolveZone } from "../utils/userZone";
import { getInvestments, getInvestmentHistory } from "../services/investmentService";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { deleteInvestmentQuerySchema, investmentBasisSchema } from "../schemas/accountSchema";
import Bill from "../models/Bill";
import User from "../models/User";
import { applyEffects } from "../services/transactionService";
import { formatAmount } from "../utils/money";

export const listInvestments = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    const payload = await getInvestments(req.user!.userId, zone);
    reply.ok(res, payload, "Investments fetched successfully");
};

export const investmentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        throw AppError.badRequest("Invalid investment id");
    }
    const txns = await getInvestmentHistory(req.user!.userId, id);
    reply.ok(res, txns, "Investment history fetched");
};

// Sets what's been invested, since when, and how. Only the cost basis moves — today's value
// (the balance) is untouched, so the gain restates by exactly the correction. `invested` is
// the total; the opening amount is what's left of it after the contributions and
// redemptions already recorded here.
export const updateInvestmentBasis = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        throw AppError.badRequest("Invalid investment id");
    }
    const body = investmentBasisSchema.parse(req.body);

    const account = await Account.findOne({ _id: id, userId: req.user?.userId, type: "investment", isArchived: false });
    if (!account) {
        throw AppError.notFound("Investment not found");
    }

    if (body.invested !== undefined) {
        const transfers = await Transaction.find({
            userId: req.user?.userId,
            type: "transfer",
            $or: [{ toAccount: account._id }, { account: account._id }],
        }).select("amount account toAccount").lean();
        const net = transfers.reduce((sum, t) => sum + (String(t.toAccount) === String(account._id) ? t.amount : -t.amount), 0);
        const opening = body.invested - net;
        if (opening < 0) {
            throw AppError.badRequest(`Invested can't be less than the ${formatAmount(net)} already added here`);
        }
        account.startingBalance = opening;
    }
    if (body.investedSince !== undefined) account.investedSince = body.investedSince;
    if (body.investedHow !== undefined) account.investedHow = body.investedHow;

    await account.save();
    reply.ok(res, account, "Investment updated");
};

/**
 * Removes a holding and everything recorded on it — for starting over after a mistake.
 * Archiving (DELETE /accounts/:id) keeps the history; this doesn't.
 *
 * The only question is what the money moves into and out of it become, because the other
 * side of each is a real account:
 *   undo — each transfer is reversed and deleted, so the money goes back where it came from.
 *   keep — each transfer becomes a balance correction on the other account, so that
 *          account's balance doesn't move (and, like any correction, it stays out of
 *          Activity and Insights).
 * Value-updates and anything else on the holding itself go with it. SIP bills that fund it
 * are deleted — they'd have nothing to fund — and it stops being anyone's default account.
 * All in one transaction.
 */
export const deleteInvestment = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        throw AppError.badRequest("Invalid investment id");
    }
    const { mode } = deleteInvestmentQuerySchema.parse(req.query);
    const userId = req.user!.userId;

    const account = await Account.findOne({ _id: id, userId, type: "investment" });
    if (!account) {
        throw AppError.notFound("Investment not found");
    }
    const holdingId = String(account._id);

    let removedTransactions = 0;
    let removedBills = 0;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const txns = await Transaction.find({ userId, $or: [{ account: account._id }, { toAccount: account._id }] }).session(session);

            for (const t of txns) {
                const isTransfer = t.type === "transfer" && t.toAccount;
                const contribution = isTransfer && String(t.toAccount) === holdingId;
                const redemption = isTransfer && String(t.account) === holdingId;

                if ((contribution || redemption) && mode === "keep") {
                    // Unwind the transfer, then re-post only the other account's half as a
                    // correction — net effect on that account: zero.
                    const other = contribution ? t.account : t.toAccount!;
                    await applyEffects(t, "revert", session);
                    t.set({
                        type: contribution ? "negativeAdjustment" : "positiveAdjustment",
                        account: other,
                        toAccount: null,
                        category: null,
                        note: `${contribution ? "Moved into" : "Redeemed from"} ${account.name} (deleted)`,
                    });
                    await applyEffects(t, "add", session);
                    await t.save({ session });
                    continue;
                }

                // Undo mode for a transfer puts the other account back; anything that only
                // touched the holding needs no revert, since the holding itself is going.
                if (contribution || redemption) await applyEffects(t, "revert", session);
                await t.deleteOne({ session });
                removedTransactions += 1;
            }

            removedBills = (await Bill.deleteMany({ userId, toInvestment: account._id }, { session })).deletedCount ?? 0;
            await Bill.updateMany({ userId, account: account._id }, { $unset: { account: 1 } }, { session });
            await User.updateOne({ _id: userId, "prefs.defaultAccount": account._id }, { $set: { "prefs.defaultAccount": null } }, { session });
            await account.deleteOne({ session });
        });
    }
    finally {
        session.endSession();
    }

    reply.ok(res, { removedTransactions, removedBills }, "Investment deleted");
};

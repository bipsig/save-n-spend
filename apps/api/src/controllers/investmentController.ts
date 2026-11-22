import { Request, Response } from "express";
import type { Valid } from "../middleware/validate";
import * as reply from "../utils/response";
import { AppError } from "../utils/AppError";
import { resolveZone } from "../utils/userZone";
import { getInvestments, getInvestmentHistory, getInvestmentTrend, getInvestmentReport } from "../services/investmentService";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { deleteInvestmentRequest, holdingIdRequest, investmentBasisRequest } from "../schemas/accountSchema";
import { applyEffects } from "../services/transactionService";
import { detachAccount } from "../services/accountDetach";
import { inTransaction } from "../utils/inTransaction";
import { notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";

const missing = () => AppError.notFound(notFound("holding"));

export const listInvestments = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    const payload = await getInvestments(req.user!.userId, zone);
    reply.ok(res, payload, "Investments fetched");
};

export const investmentTrend = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    reply.ok(res, await getInvestmentTrend(req.user!.userId, zone), "Investment trend fetched");
};

export const investmentReport = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    reply.ok(res, await getInvestmentReport(req.user!.userId, zone), "Investment report fetched");
};

// Only a holding has this history. Any other account id (a bank's included) is a 404, rather
// than that account's own rows.
export const investmentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = (req.valid as Valid<typeof holdingIdRequest>).params;
    const userId = req.user!.userId;
    if (!(await Account.exists({ _id: id, userId, type: "investment" }))) throw missing();
    const txns = await getInvestmentHistory(userId, id);
    reply.ok(res, toDTOs(txns), "Investment history fetched");
};

// Sets what's been invested, since when, and how. Only the cost basis moves — today's value
// (the balance) is untouched, so the gain restates by exactly the correction. `invested` is
// the total; the opening amount is what's left of it after the contributions and
// redemptions already recorded here.
export const updateInvestmentBasis = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof investmentBasisRequest>;
    const userId = req.user!.userId;

    // In one transaction, so the transfers summed below are the ones there when it's saved.
    const account = await inTransaction(async (session) => {
        const holding = await Account.findOne({ _id: id, userId, type: "investment", isArchived: false }).session(session);
        if (!holding) throw missing();

        if (body.invested !== undefined) {
            const transfers = await Transaction.find({
                userId,
                type: "transfer",
                $or: [{ toAccount: holding._id }, { account: holding._id }],
            }).select("amount account toAccount").session(session).lean();
            const net = transfers.reduce((sum, t) => sum + (String(t.toAccount) === String(holding._id) ? t.amount : -t.amount), 0);
            const opening = body.invested - net;
            // No amount in the sentence: the app shows it as-is, privacy mode or not.
            if (opening < 0) throw AppError.badRequest("Invested can't be less than what's already been added here");
            holding.startingBalance = opening;
        }
        if (body.investedSince !== undefined) holding.investedSince = body.investedSince;
        if (body.investedHow !== undefined) holding.investedHow = body.investedHow;

        return holding.save({ session });
    });
    reply.ok(res, toDTO(account), "Holding updated");
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
 * All in one transaction, with the holding read inside it.
 */
export const deleteInvestment = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, query: { mode } } = req.valid as Valid<typeof deleteInvestmentRequest>;
    const userId = req.user!.userId;

    const result = await inTransaction(async (session) => {
        // An archived holding is refused here as re-base refuses it (gaps row 168): no screen
        // shows one, and nothing unarchives it.
        const account = await Account.findOne({ _id: id, userId, type: "investment", isArchived: false }).session(session);
        if (!account) throw missing();
        const holdingId = String(account._id);
        // Counted per attempt, so a retried transaction doesn't add its first try's rows.
        let removedTransactions = 0;

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
                // The other side may already be gone (older data); its row is kept as before,
                // with nothing to re-post.
                if (await Account.exists({ _id: other, userId }).session(session)) await applyEffects(t, "add", session);
                await t.save({ session });
                continue;
            }

            // Undo mode for a transfer puts the other account back; anything that only
            // touched the holding needs no revert, since the holding itself is going.
            if (contribution || redemption) await applyEffects(t, "revert", session);
            await t.deleteOne({ session });
            removedTransactions += 1;
        }

        const removedBills = await detachAccount(userId, account._id, "delete", session);
        await account.deleteOne({ session });
        return { removedTransactions, removedBills };
    });

    reply.ok(res, result, "Holding deleted");
};

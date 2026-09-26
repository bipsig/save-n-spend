import { Request, Response } from "express";
import mongoose from "mongoose";
import * as reply from "../utils/response";
import { AppError } from "../utils/AppError";
import { resolveZone } from "../utils/userZone";
import { getInvestments, getInvestmentHistory } from "../services/investmentService";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { investmentBasisSchema } from "../schemas/accountSchema";
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


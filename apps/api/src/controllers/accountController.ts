import { Request, Response } from "express"
import { AppError } from "../utils/AppError";
import Account from "../models/Account";
import * as reply from "../utils/response";
import { createAccountSchema, updateAccountSchema } from "../schemas/accountSchema";

export const listAccounts = async (req: Request, res: Response): Promise<void> => {
    const accounts = await Account.find({
        userId: req.user?.userId,
        isArchived: false
    });

    reply.ok(res, accounts, "Accounts fetched successfully");
}

export const createAccount = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createAccountSchema.parse(req.body);

    const savedAccount = await Account.create({
        userId: req.user?.userId,
        name: reqBody.name,
        type: reqBody.type,
        balance: reqBody.startingBalance,
        startingBalance: reqBody.startingBalance,
        icon: reqBody.icon ?? "wallet",
        color: reqBody.color ?? "success"
    });

    reply.created(res, savedAccount, "Account created successfully");
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

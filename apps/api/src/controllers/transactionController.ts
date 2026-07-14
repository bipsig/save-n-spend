import { Request, Response } from "express";
import { createTransactionSchema, listTransactionQuerySchema } from "../schemas/transactionSchema";
import mongoose from "mongoose";
import Account from "../models/Account";
import { AppError } from "../utils/AppError";
import Transaction from "../models/Transaction";
import { applyEffects } from "../services/transactionService";
import * as reply from "../utils/response";
import Category from "../models/Category";

export const createTransaction = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createTransactionSchema.parse(req.body);
    const accountIds = [reqBody.account];
    if (reqBody.type === "transfer") {
        if (reqBody.account === reqBody.toAccount) {
            throw AppError.badRequest("Cannot transfer to same account");
        }
        accountIds.push(reqBody.toAccount);
    }

    const actualAccounts = await Account.find({
        _id: { $in: accountIds },
        userId: req.user?.userId,
        isArchived: false
    });

    if (actualAccounts.length !== accountIds.length) {
        throw AppError.badRequest("Account not found");
    }

    let createdTransaction;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [transaction] = await Transaction.create([{
                userId: req.user?.userId,
                ...reqBody,
                occurredAt: reqBody.occurredAt ? reqBody.occurredAt : new Date(),
            }], { session });

            await applyEffects(transaction, "add", session);

            createdTransaction = transaction
        })
    }
    finally {
        session.endSession();
    }

    reply.created(res, createdTransaction, "Transaction created!");
}

export const filterTransactions = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate, category, type, search, page, limit } = listTransactionQuerySchema.parse(req.query);

    const filters: Record<string, unknown> = {
        userId: req.user?.userId
    };

    if (category) {
        const children = await Category.find({
            parent: category,
            userId: req.user?.userId
        }, { _id: 1 });
        
        const reqCategories = children.map((child) => {
            return child._id.toString();
        });
        reqCategories.push (category);

        filters.category = { $in: reqCategories };
    }
    if (type) {
        filters.type = type;
    }
    if (search) {
        filters.title = {
            $regex: search,
            $options: "i"
        }
    }
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(23, 59, 59, 999);

        filters.occurredAt = {
            $gte: start,
            $lte: end
        };
    }

    const filteredTransactions = await Transaction.paginate(
        filters,
        {
            page,
            limit,
            sort: { occurredAt: -1 },
            populate: { path: "category" }
        }
    );

    reply.ok(res, filteredTransactions, "Transactions fetched");
}
import { Request, Response } from "express";
import { createTransactionSchema, listTransactionQuerySchema, transactionSummaryQuerySchema, updateTransactionSchema } from "../schemas/transactionSchema";
import mongoose from "mongoose";
import Account from "../models/Account";
import { AppError } from "../utils/AppError";
import Transaction from "../models/Transaction";
import { applyEffects } from "../services/transactionService";
import { checkBudgetAlerts } from "../services/budgetAlertService";
import * as reply from "../utils/response";
import Category from "../models/Category";
import { dayBoundsFromKeyInZone } from "../utils/timezone";
import { resolveZone } from "../utils/userZone";

// Neutralise every regex metacharacter so a search term can only ever match itself.
// `$&` is the whole match, so each special character comes back escaped.
const escapeRegex = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    // Resolved once, because the budget alert below has to be told which month this
    // spend belongs to and must not re-read the clock to find out.
    const occurredAt = reqBody.occurredAt ? new Date(reqBody.occurredAt) : new Date();

    let createdTransaction;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [transaction] = await Transaction.create([{
                userId: req.user?.userId,
                ...reqBody,
                occurredAt,
            }], { session });

            await applyEffects(transaction, "add", session);

            createdTransaction = transaction
        })
    }
    finally {
        session.endSession();
    }

    // After the commit and before the response: only a committed expense can have
    // crossed a budget, and the check never throws (see budgetAlertService).
    if (reqBody.type === "expense") {
        await checkBudgetAlerts(req.user!.userId, reqBody.category, occurredAt);
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
            // Escaped, not interpolated. The term reaches `$regex` as a pattern, so a
            // lone `(` is an invalid expression the driver rejects with a 500, and
            // `(a+)+b` backtracks catastrophically inside the database rather than in
            // our process. Escaping every metacharacter makes it a literal substring —
            // which is the only thing a search box ever meant. The length cap lives in
            // the schema.
            $regex: escapeRegex(search),
            $options: "i"
        }
    }
    if (startDate && endDate) {
        // `startDate`/`endDate` are calendar days the user picked, so their bounds
        // are the user's midnights — not UTC's. Getting this wrong shifted the edge
        // of every filtered range by the zone offset, which is how a purchase made
        // late last night went missing from "Today".
        const zone = await resolveZone(req);

        filters.occurredAt = {
            $gte: dayBoundsFromKeyInZone(startDate, zone).start,
            $lte: dayBoundsFromKeyInZone(endDate, zone).end
        };
    }

    const filteredTransactions = await Transaction.paginate(
        filters,
        {
            page,
            limit,
            sort: { occurredAt: -1 },
        }
    );

    reply.ok(res, filteredTransactions, "Transactions fetched");
}

export const getTransactionSummary = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = transactionSummaryQuerySchema.parse(req.query);

    const match: Record<string, unknown> = {
        userId: new mongoose.Types.ObjectId(req.user!.userId),
        type: { $in: ["income", "expense"] }
    };

    if (startDate && endDate) {
        // Same zone-local day bounds as the list above — the summary card sits on top
        // of that list, so a total computed over a differently-clamped window would
        // not add up to the rows underneath it.
        const zone = await resolveZone(req);
        match.occurredAt = {
            $gte: dayBoundsFromKeyInZone(startDate, zone).start,
            $lte: dayBoundsFromKeyInZone(endDate, zone).end
        };
    }

    const sums = await Transaction.aggregate([
        { $match: match },
        { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    const income = sums.find((s) => s._id === "income")?.total ?? 0;
    const expenses = sums.find((s) => s._id === "expense")?.total ?? 0;

    reply.ok(res, { income, expenses, savings: income - expenses }, "Transaction summary fetched");
}

export const getTransaction = async (req: Request, res: Response): Promise<void> => {
    const { id: transactionId } = req.params;

    const transaction = await Transaction.findOne({
        _id: transactionId,
        userId: req.user?.userId
    });

    if (!transaction) {
        throw AppError.notFound("Transaction not found");
    }

    reply.ok(res, transaction, "Transaction fetched!");
}

export const updateTransaction = async (req: Request, res: Response): Promise<void> => {
    const { id: transactionId } = req.params;
    const reqBody = updateTransactionSchema.parse(req.body);

    const transaction = await Transaction.findOne({
        _id: transactionId,
        userId:  req.user?.userId
    });

    if (!transaction) {
        throw AppError.notFound("Transaction not found");
    }

    if (reqBody.account) {
        const account = await Account.findOne({
            _id: reqBody.account,
            userId: req.user?.userId,
            isArchived: false
        });
        if (!account) {
            throw AppError.badRequest("Account not found");
        }
    }
    if (reqBody.toAccount) {
        const account = await Account.findOne({
            _id: reqBody.toAccount,
            userId: req.user?.userId,
            isArchived: false
        });
        if (!account) {
            throw AppError.badRequest("Account not found");
        }
    }


    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await applyEffects (transaction, "revert", session);
            
            transaction.set(reqBody);

            await applyEffects (transaction, "add", session);

            await transaction.save({ session })
        })
    }
    finally {
        session.endSession();
    }

    // An edit moves money as surely as a new entry does — raising an amount, or moving
    // one into a different category, can be what crosses the limit.
    if (transaction.type === "expense") {
        await checkBudgetAlerts(req.user!.userId, transaction.category, transaction.occurredAt);
    }

    reply.ok(res, transaction, "Transaction updated!");

}

export const deleteTransaction = async (req: Request, res: Response) : Promise<void> => {
    const { id: transactionId } = req.params;

    const transaction = await Transaction.findOne({
        _id: transactionId,
        userId:  req.user?.userId
    });

    if (!transaction) {
        throw AppError.notFound("Transaction not found");
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await applyEffects(transaction, "revert", session);

            await Transaction.deleteOne({
                _id: transactionId
            },{ session });
        })
    }
    finally {
        session.endSession();
    }

    reply.ok(res, null, "Transaction Deleted");
}
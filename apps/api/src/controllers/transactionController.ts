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

    // A split expense: `amount` is the user's own share, and each `owedBy` row becomes a
    // transfer into that person's account for what they owe. `owedBy` comes off the body
    // here because it is not a Transaction field — the transfers below are its storage.
    let owedBy: { account: string; amount: number }[] | undefined;
    let transactionBody: Record<string, unknown> = reqBody;
    if (reqBody.type === "expense" && reqBody.owedBy) {
        const { owedBy: split, ...rest } = reqBody;
        owedBy = split;
        transactionBody = rest;
    }

    const accountIds = [reqBody.account];
    if (reqBody.type === "transfer") {
        if (reqBody.account === reqBody.toAccount) {
            throw AppError.badRequest("Cannot transfer to same account");
        }
        accountIds.push(reqBody.toAccount);
    }
    if (owedBy) {
        const owedAccounts = owedBy.map((row) => row.account);
        // The set also carries the source, so paying yourself back is caught with the
        // duplicates. The count check below then covers existence for the whole list.
        if (new Set([...owedAccounts, reqBody.account]).size !== owedAccounts.length + 1) {
            throw AppError.badRequest("Each person can appear only once in a split");
        }
        accountIds.push(...owedAccounts);
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
            const splitGroupId = owedBy ? new mongoose.Types.ObjectId() : null;

            const [transaction] = await Transaction.create([{
                userId: req.user?.userId,
                ...transactionBody,
                occurredAt,
                splitGroupId,
            }], { session });

            await applyEffects(transaction, "add", session);

            // One transfer per person owed, in the same group and at the same instant, so
            // the whole split stands or falls as one write and reads as one event.
            for (const row of owedBy ?? []) {
                const [transfer] = await Transaction.create([{
                    userId: req.user?.userId,
                    type: "transfer",
                    amount: row.amount,
                    account: reqBody.account,
                    toAccount: row.account,
                    note: reqBody.type === "expense" ? reqBody.title : undefined,
                    occurredAt,
                    splitGroupId,
                }], { session });

                await applyEffects(transfer, "add", session);
            }

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
    else {
        // Balance corrections move an account's balance but are not money coming in or
        // going out, and Activity reads as a history of what the user actually did with
        // their money. They stay out of it. Exports still carry them (see
        // `lib/export.ts`), because an export is a ledger rather than a narrative, and a
        // ledger whose rows do not add up to the balance is worse than a longer one.
        filters.type = { $nin: ["positiveAdjustment", "negativeAdjustment"] };
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

// The last 12 months only — title vocabulary drifts (old jobs, old shops), and bounding the
// match keeps this cheap on the same {userId, occurredAt} index every other aggregation here
// already relies on, rather than scanning a growing lifetime of rows for a feature that's
// only ever surfacing the recent handful anyway.
const TITLE_SUGGESTION_MONTHS = 12;
const TITLE_SUGGESTION_LIMIT = 150;

export const getTitleSuggestions = async (req: Request, res: Response): Promise<void> => {
    const since = new Date();
    since.setMonth(since.getMonth() - TITLE_SUGGESTION_MONTHS);

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: { $in: ["expense", "income"] },
                title: { $type: "string", $ne: "" },
                occurredAt: { $gte: since }
            }
        },
        // Newest first, so `$first` below keeps the way the title was spelled most
        // recently — a simpler stand-in for "most common casing" that needs no second
        // grouping pass, and the one a user is more likely to expect repeated anyway.
        { $sort: { occurredAt: -1 } },
        {
            $group: {
                _id: {
                    type: "$type",
                    key: { $toLower: { $trim: { input: "$title" } } },
                    category: "$category"
                },
                title: { $first: "$title" },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: TITLE_SUGGESTION_LIMIT }
    ]);

    const suggestions = rows.map((row) => ({
        title: row.title as string,
        type: row._id.type as "expense" | "income",
        category: row._id.category ? (row._id.category as mongoose.Types.ObjectId).toString() : null,
        count: row.count as number
    }));

    reply.ok(res, suggestions, "Title suggestions fetched");
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
            // Deleting a split's expense takes the whole group with it: transfers left
            // behind would keep claiming the person owes money for a purchase that no
            // longer exists. Deleting one of the transfers alone is still allowed — that
            // is how a person is taken off a split after the fact.
            if (transaction.type === "expense" && transaction.splitGroupId) {
                const group = await Transaction.find({
                    userId: req.user?.userId,
                    splitGroupId: transaction.splitGroupId
                }).session(session);

                for (const member of group) {
                    await applyEffects(member, "revert", session);
                }

                await Transaction.deleteMany({
                    userId: req.user?.userId,
                    splitGroupId: transaction.splitGroupId
                }, { session });
                return;
            }

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
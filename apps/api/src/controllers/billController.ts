import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { createBillSchema, updateBillSchema, listBillQuerySchema, payBillSchema } from "../schemas/billSchema";
import Bill from "../models/Bill";
import Category from "../models/Category";
import * as reply from '../utils/response';
import Account from "../models/Account";
import mongoose from "mongoose";
import Transaction from "../models/Transaction";
import { applyEffects } from "../services/transactionService";
import User from "../models/User";
import { startOfDayInZone } from "../utils/timezone";
import { resolveZone } from "../utils/userZone";
import { advanceDueDate, isFuturePeriod, isSettledForPeriod } from "../services/billService";

// The zone-local period arithmetic these handlers run on lives in services/billService,
// because the reminder job has to reach exactly the same verdict about a bill as this
// screen does.

export const listBills = async (req: Request, res: Response): Promise<void> => {
    const { status } = listBillQuerySchema.parse(req.query);

    const filter: Record<string, unknown> = { userId: req.user?.userId };
    if (status) filter.status = status;

    const bills = await Bill.find(filter).sort({ dueDate: 1 }).lean();

    const zone = await resolveZone(req);
    const now = new Date();
    const startOfToday = startOfDayInZone(now, zone);

    const result = bills.flatMap((bill) => {
        if (isSettledForPeriod(bill, now, zone)) {
            return [{ ...bill, status: "paid" }];
        }

        if (bill.status === "paid") {
            return [];
        }

        const derived = bill.dueDate < startOfToday ? "overdue" : "pending";
        return [{ ...bill, status: derived }];
    });

    reply.ok(res, result, "Bills fetched successfully");
}

export const createBill = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createBillSchema.parse(req.body);

    if (reqBody.category) {
        const category = await Category.findOne({
            _id: reqBody.category,
            userId: req.user?.userId,
            isArchived: false
        });

        if (!category) {
            throw AppError.badRequest("Category not found");
        }
    }

    if (reqBody.recurring && !reqBody.frequency) {
        throw AppError.badRequest("Frequency is required for recurring bills");
    }

    if (reqBody.toInvestment) {
        const investment = await Account.findOne({
            _id: reqBody.toInvestment,
            userId: req.user?.userId,
            type: "investment",
            isArchived: false
        });
        if (!investment) {
            throw AppError.badRequest("Choose an investment account");
        }
    }

    const bill = await Bill.create({
        userId: req.user?.userId,
        ...reqBody
    });

    reply.created(res, bill, "Bill created successfully");
}

export const updateBill = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const reqBody = updateBillSchema.parse(req.body);

    if (reqBody.category) {
        const category = await Category.findOne({
            _id: reqBody.category,
            userId: req.user?.userId,
            isArchived: false
        });

        if (!category) {
            throw AppError.badRequest("Category not found");
        }
    }

    if (reqBody.toInvestment) {
        const investment = await Account.findOne({
            _id: reqBody.toInvestment,
            userId: req.user?.userId,
            type: "investment",
            isArchived: false
        });
        if (!investment) {
            throw AppError.badRequest("Choose an investment account");
        }
    }

    const bill = await Bill.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        reqBody,
        { new: true }
    );

    if (!bill) {
        throw AppError.notFound("Bill not found");
    }

    reply.ok(res, bill, "Bill updated successfully");
}

export const deleteBill = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const bill = await Bill.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!bill) {
        throw AppError.notFound("Bill not found");
    }

    reply.ok(res, null, "Bill deleted successfully");
}

export const markBillPaid = async (req: Request, res: Response): Promise<void> => {
    const { id: billId } = req.params;

    const bill = await Bill.findOne({
        _id: billId,
        userId: req.user?.userId
    });

    if (!bill) {
        throw AppError.notFound("Bill not found");
    }

    if (bill.status === "paid") {
        throw AppError.badRequest("Bill is already paid");
    }

    const zone = await resolveZone(req);

    if (bill.recurring && isFuturePeriod(bill.dueDate, new Date(), zone, bill.frequency)) {
        throw AppError.badRequest("This bill is already handled for this period");
    }

    const { account: chosenAccount } = payBillSchema.parse(req.body ?? {});

    let account = null;
    if (chosenAccount) {
        account = await Account.findOne({ _id: chosenAccount, userId: req.user?.userId, isArchived: false });
        if (!account) {
            throw AppError.badRequest("Account not found");
        }
    }
    else if (bill.account) {
        account = await Account.findOne({ _id: bill.account, userId: req.user?.userId, isArchived: false });
    }

    if (!account) {
        const user = await User.findById(req.user?.userId);
        if (user?.prefs?.defaultAccount) {
            account = await Account.findOne({ _id: user.prefs.defaultAccount, userId: req.user?.userId, isArchived: false });
        }
    }

    if (!account) {
        throw AppError.badRequest("No account to charge this bill to");
    }

    // A SIP bill funds an investment: marking it done moves money INTO that holding as a
    // transfer, not an expense — so it never hits the spending charts and lands in the
    // holding. Re-checked here (not just at create) in case the holding was archived since.
    let investmentId: mongoose.Types.ObjectId | null = null;
    if (bill.toInvestment) {
        const investment = await Account.findOne({ _id: bill.toInvestment, userId: req.user?.userId, type: "investment", isArchived: false });
        if (!investment) {
            throw AppError.badRequest("This SIP's investment no longer exists — edit the bill to point it at one");
        }
        investmentId = investment._id as mongoose.Types.ObjectId;
    }

    let settledBill = bill;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // Claim the bill atomically BEFORE moving any money. The status/period guard above
            // is a check-then-act: a double-tap or an offline-queue replay can both pass it and
            // each post a full expense/transfer + double-debit the account. This conditional
            // update is the idempotency key — for a one-off it's status:"pending"; for a
            // recurring bill it's the current dueDate, which this same update advances, so a
            // second racing request matches nothing, gets null, and aborts the whole txn
            // (rolling back before any transaction is written).
            const now = new Date();
            const claimed = bill.recurring
                ? await Bill.findOneAndUpdate(
                    { _id: bill._id, userId: req.user?.userId, dueDate: bill.dueDate },
                    { dueDate: advanceDueDate(bill.dueDate, zone, bill.frequency), lastPaidAt: now },
                    { session, new: true },
                )
                : await Bill.findOneAndUpdate(
                    { _id: bill._id, userId: req.user?.userId, status: "pending" },
                    { status: "paid", lastPaidAt: now },
                    { session, new: true },
                );

            if (!claimed) {
                throw AppError.badRequest("This bill was just handled — nothing more to do");
            }

            const [transaction] = await Transaction.create([
                investmentId
                    ? {
                        userId: req.user?.userId,
                        type: "transfer",
                        amount: bill.amount,
                        account: account?._id,
                        toAccount: investmentId,
                        occurredAt: now
                    }
                    : {
                        userId: req.user?.userId,
                        type: "expense",
                        amount: bill.amount,
                        account: account?._id,
                        category: bill.category,
                        title: bill.name,
                        occurredAt: now
                    }
            ], { session });

            await applyEffects(transaction, "add", session);

            settledBill = claimed;
        })
    }
    finally {
        session.endSession();
    }

    reply.ok(res, settledBill, "Bill marked as paid");
}

export const skipBill = async (req: Request, res: Response): Promise<void> => {
    const { id: billId } = req.params;

    const bill = await Bill.findOne({
        _id: billId,
        userId: req.user?.userId
    });

    if (!bill) {
        throw AppError.notFound("Bill not found");
    }

    if (!bill.recurring) {
        throw AppError.badRequest("Only recurring bills can be skipped");
    }

    const zone = await resolveZone(req);

    if (isFuturePeriod(bill.dueDate, new Date(), zone, bill.frequency)) {
        throw AppError.badRequest("This bill is already handled for this period");
    }

    bill.dueDate = advanceDueDate(bill.dueDate, zone, bill.frequency);
    await bill.save();

    reply.ok(res, bill, "Bill skipped");
}

import { Request, Response } from "express";
import type { ClientSession } from "mongoose";
import { AppError } from "../utils/AppError";
import type { Valid } from "../middleware/validate";
import { billProblems, createBillSchemas, updateBillSchemas, listBillsSchemas, payBillSchemas, billIdSchemas, skipBillSchemas } from "../schemas/billSchema";
import Bill from "../models/Bill";
import { keepsCategory, requireCategory } from "../services/ownership";
import * as reply from '../utils/response';
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { applyEffects } from "../services/transactionService";
import User from "../models/User";
import { resolveZone } from "../utils/userZone";
import { advanceDueDate, billState, isFuturePeriod } from "../services/billService";
import { inTransaction } from "../utils/inTransaction";
import { conflict, notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";

// The zone-local period arithmetic these handlers run on lives in services/billService,
// because the reminder job has to reach exactly the same verdict about a bill as this
// screen does.

const ALREADY_PAID = conflict("This bill is already paid for this period");

/** Each reference the body names must be one of the user's live records of the right kind.
 *  An edit that keeps the bill's category (the sheet sends it back) is not re-checked, so a
 *  bill filed under a category archived since stays editable. */
const checkReferences = async (
    userId: string,
    body: { category?: string | null; account?: string; toInvestment?: string | null },
    before?: { category?: unknown },
): Promise<void> => {
    if (body.category && !keepsCategory(before?.category, body.category)) {
        await requireCategory(userId, body.category, { kind: "expense", live: true });
    }
    if (body.account && !(await Account.exists({ _id: body.account, userId, isArchived: false }))) {
        throw AppError.invalidReference("account", "Account", "accounts");
    }
    if (body.toInvestment && !(await Account.exists({ _id: body.toInvestment, userId, type: "investment", isArchived: false }))) {
        throw AppError.invalidReference("toInvestment", "Investment", "holdings");
    }
};

const rejectProblems = (problems: { path: string; message: string }[]): void => {
    if (problems.length) throw new AppError(400, problems[0].message, { code: "invalid_input", issues: problems });
};

export const listBills = async (req: Request, res: Response): Promise<void> => {
    const { query: { status } } = req.valid as Valid<typeof listBillsSchemas>;

    const bills = await Bill.find({ userId: req.user?.userId }).sort({ dueDate: 1 }).lean();

    const zone = await resolveZone(req);
    const now = new Date();

    const result = bills.flatMap((bill) => {
        const state = billState(bill, now, zone);
        return state.listed ? [{ ...bill, status: state.status }] : [];
    });

    // Filtered on the status shown, not the stored one: a recurring bill is never stored as
    // paid, and "overdue" is never stored at all.
    reply.ok(res, toDTOs(status ? result.filter((b) => b.status === status) : result), "Bills fetched");
}

export const createBill = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createBillSchemas>;

    await checkReferences(req.user!.userId, body);

    // In a transaction so a sent Idempotency-Key is recorded with the bill (utils/inTransaction).
    const [bill] = await inTransaction((session) => Bill.create([{
        userId: req.user?.userId,
        ...body
    }], { session }));

    reply.created(res, toDTO(bill), "Bill created");
}

export const updateBill = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof updateBillSchemas>;
    const userId = req.user!.userId;

    const existing = await Bill.findOne({ _id: id, userId }).lean();
    if (!existing) {
        throw AppError.notFound(notFound("bill"));
    }

    rejectProblems(billProblems({ ...existing, ...body }));
    await checkReferences(userId, body, existing);

    const bill = await Bill.findOneAndUpdate({ _id: id, userId }, body, { new: true });

    if (!bill) {
        throw AppError.notFound(notFound("bill"));
    }

    reply.ok(res, toDTO(bill), "Bill updated");
}

export const deleteBill = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof billIdSchemas>;

    const bill = await Bill.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!bill) {
        throw AppError.notFound(notFound("bill"));
    }

    reply.ok(res, null, "Bill deleted");
}

/** The account a payment comes out of: the one picked, else the bill's, else the default. */
const accountToCharge = async (userId: string, chosen: string | undefined, billAccount: unknown, session: ClientSession) => {
    const live = (id: unknown) => Account.findOne({ _id: id, userId, isArchived: false }).session(session);

    if (chosen) {
        const account = await live(chosen);
        if (!account) throw AppError.invalidReference("account", "Account", "accounts");
        return account;
    }
    const own = billAccount ? await live(billAccount) : null;
    if (own) return own;

    const user = await User.findById(userId).select("prefs.defaultAccount").session(session).lean();
    const fallback = user?.prefs?.defaultAccount ? await live(user.prefs.defaultAccount) : null;
    if (!fallback) throw AppError.badRequest("Pick an account to pay this bill from");
    return fallback;
};

export const markBillPaid = async (req: Request, res: Response): Promise<void> => {
    const { params: { id: billId }, body: { account: chosenAccount } } = req.valid as Valid<typeof payBillSchemas>;
    const userId = req.user!.userId;

    // Read once, outside the transaction, on purpose: this copy is the claim below. If MongoDB
    // retries the transaction, the retry must still claim the period THIS request saw, never
    // one a racing request has just advanced to (that would pay an overdue bill twice).
    const seen = await Bill.findOne({ _id: billId, userId }).lean();

    if (!seen) {
        throw AppError.notFound(notFound("bill"));
    }

    const zone = await resolveZone(req);

    if (billState(seen, new Date(), zone).settled) {
        throw AppError.conflict(ALREADY_PAID);
    }

    const settledBill = await inTransaction(async (session) => {
        const account = await accountToCharge(userId, chosenAccount, seen.account, session);

        // A SIP bill funds an investment: marking it done moves money INTO that holding as a
        // transfer, not an expense, so it never hits the spending charts. Re-checked here (not
        // just at create) in case the holding was archived since.
        let investmentId: unknown = null;
        if (seen.toInvestment) {
            const investment = await Account.findOne({ _id: seen.toInvestment, userId, type: "investment", isArchived: false }).session(session);
            if (!investment) {
                throw AppError.conflict(conflict("This bill's holding isn't there any more", "Edit the bill to pick another"));
            }
            investmentId = investment._id;
        }

        // Claim the bill BEFORE moving any money. For a one-off the key is status "pending";
        // for a recurring bill it is the due date read above, which this same update advances,
        // so a second request racing this one matches nothing and the whole transaction rolls
        // back before any row is written.
        const now = new Date();
        const claimed = seen.recurring
            ? await Bill.findOneAndUpdate(
                { _id: seen._id, userId, dueDate: seen.dueDate },
                { dueDate: advanceDueDate(seen.dueDate, zone, seen.frequency), lastPaidAt: now },
                { session, new: true },
            )
            : await Bill.findOneAndUpdate(
                { _id: seen._id, userId, status: "pending" },
                { status: "paid", lastPaidAt: now },
                { session, new: true },
            );

        if (!claimed) {
            throw AppError.conflict(ALREADY_PAID);
        }

        const [transaction] = await Transaction.create([
            investmentId
                ? {
                    userId,
                    type: "transfer",
                    amount: seen.amount,
                    account: account._id,
                    toAccount: investmentId,
                    occurredAt: now
                }
                : {
                    userId,
                    type: "expense",
                    amount: seen.amount,
                    account: account._id,
                    category: seen.category,
                    title: seen.name,
                    occurredAt: now
                }
        ], { session });

        await applyEffects(transaction, "add", session);

        return claimed;
    });

    reply.ok(res, toDTO(settledBill), "Bill paid");
}

export const skipBill = async (req: Request, res: Response): Promise<void> => {
    const { params: { id: billId } } = req.valid as Valid<typeof skipBillSchemas>;
    const userId = req.user!.userId;

    const seen = await Bill.findOne({ _id: billId, userId }).lean();

    if (!seen) {
        throw AppError.notFound(notFound("bill"));
    }

    if (!seen.recurring) {
        throw AppError.conflict(conflict("Only recurring bills can be skipped"));
    }

    const zone = await resolveZone(req);

    if (isFuturePeriod(seen.dueDate, new Date(), zone, seen.frequency)) {
        throw AppError.conflict(ALREADY_PAID);
    }

    // Conditional on the due date read above, as pay is: a pay or skip racing this one has
    // already moved it, so this matches nothing instead of advancing a second period.
    const bill = await inTransaction(async (session) => {
        const advanced = await Bill.findOneAndUpdate(
            { _id: seen._id, userId, dueDate: seen.dueDate },
            { dueDate: advanceDueDate(seen.dueDate, zone, seen.frequency) },
            { new: true, session },
        );
        if (!advanced) throw AppError.conflict(ALREADY_PAID);
        return advanced;
    });

    reply.ok(res, toDTO(bill), "Bill skipped");
}

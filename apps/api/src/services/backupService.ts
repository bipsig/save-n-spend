import mongoose, { type ClientSession, type Model } from "mongoose";
import User from "../models/User";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Budget from "../models/Budget";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import Trip from "../models/Trip";
import TripExpense from "../models/TripExpense";
import { BackupPayload } from "../schemas/backupSchema";
import { AppError } from "../utils/AppError";
import { unresolvedReferences, type Reference, type Target } from "./backupReferences";

const BACKUP_VERSION = 1;
const FOREIGN_REFERENCE = "This backup refers to data that isn't yours";

// Everything the user entered themselves, byte-for-byte. HighlightLog and Notification
// are deliberately excluded — both are derived from this same data and regenerate on
// their own after a restore; bringing them back would restore a stale audit trail, not
// real data. `password`/`resetToken`/`resetTokenExpiry`/`totpSecret`/`googleId`/
// `pushToken`/`totpEnabled` never leave this function: `.lean()` skips User's own toJSON
// transform entirely, so they are excluded here explicitly via `.select()`, not assumed.
export const exportAccountData = async (userId: string) => {
    const uid = new mongoose.Types.ObjectId(userId);

    const [user, accounts, categories, transactions, budgets, bills, goals, trips, tripExpenses] = await Promise.all([
        User.findById(uid).select("currency prefs").lean(),
        Account.find({ userId: uid }).lean(),
        Category.find({ userId: uid }).lean(),
        Transaction.find({ userId: uid }).lean(),
        Budget.find({ userId: uid }).lean(),
        Bill.find({ userId: uid }).lean(),
        Goal.find({ userId: uid }).lean(),
        Trip.find({ userId: uid }).lean(),
        TripExpense.find({ userId: uid }).lean(),
    ]);

    return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        preferences: {
            currency: user?.currency,
            timeZone: user?.prefs.timeZone,
            notifications: user?.prefs.notifications,
            defaultAccount: user?.prefs.defaultAccount ?? null,
        },
        accounts,
        categories,
        transactions,
        budgets,
        bills,
        goals,
        trips,
        tripExpenses,
    };
};

type Collection = [string, Model<any>, Record<string, unknown>[]];

const REFERENCED: Record<Target, Model<any>> = { accounts: Account, categories: Category, trips: Trip, tripExpenses: TripExpense };
const OBJECT_ID = /^[a-f0-9]{24}$/i;

// A reference that names nothing anywhere is left alone (older data has such rows, and they
// restore exactly as before); one that names another user's document is refused.
const firstForeignReference = async (uid: mongoose.Types.ObjectId, payload: BackupPayload, session: ClientSession): Promise<Reference | null> => {
    const refs = unresolvedReferences(payload);
    const foreign = new Set<string>();
    for (const [target, DocModel] of Object.entries(REFERENCED) as [Target, Model<any>][]) {
        const ids = [...new Set(refs.filter((r) => r.target === target).map((r) => r.id.toLowerCase()))].filter((id) => OBJECT_ID.test(id));
        if (ids.length === 0) continue;
        const hits = await DocModel.find({ _id: { $in: ids }, userId: { $ne: uid } }).select("_id").session(session).lean();
        for (const hit of hits) foreign.add(`${target}:${String(hit._id)}`);
    }
    return refs.find((r) => foreign.has(`${r.target}:${r.id.toLowerCase()}`)) ?? null;
};

// Wipes every one of THIS user's own documents across the collections and replaces
// them with the backup's — never merges. Every document keeps its original `_id` (so
// every cross-reference inside the backup, e.g. Transaction.account or Budget.category,
// stays correct with no remapping table); only `userId` is rewritten here, which is what
// makes it safe to restore an old backup into a different account after a reinstall.
// insertMany's own timestamps step only fills in createdAt/updatedAt when they're absent
// (see mongoose's initializeTimestamps), so passing them through already-set preserves
// them exactly — Goal's pace projection depends on the real creation date, not the moment
// of restore. Runs inside the caller's own transaction: a mid-import failure rolls back
// to the pre-restore state.
export const restoreAccountData = async (
    userId: string,
    payload: BackupPayload,
    session: ClientSession
): Promise<Record<string, number>> => {
    const uid = new mongoose.Types.ObjectId(userId);

    const foreign = await firstForeignReference(uid, payload, session);
    if (foreign) {
        // Where it is goes in `issues`; the id never goes in the sentence.
        throw new AppError(400, FOREIGN_REFERENCE, {
            code: "invalid_reference",
            issues: [{ path: `${foreign.collection}.${foreign.field}`, message: FOREIGN_REFERENCE }],
        });
    }

    const replaced = [Account, Category, Transaction, Budget, Bill, Goal, Trip, TripExpense] as Model<any>[];
    // One after another: MongoDB doesn't support parallel operations in one transaction.
    for (const DocModel of replaced) {
        await DocModel.deleteMany({ userId: uid }, { session });
    }

    const collections: Collection[] = [
        ["accounts", Account, payload.accounts],
        ["categories", Category, payload.categories],
        ["transactions", Transaction, payload.transactions],
        ["budgets", Budget, payload.budgets],
        ["bills", Bill, payload.bills],
        ["goals", Goal, payload.goals],
        // Optional in the file: a backup made before trips existed restores with none.
        ["trips", Trip, payload.trips ?? []],
        ["tripExpenses", TripExpense, payload.tripExpenses ?? []],
    ];

    const counts: Record<string, number> = {};
    for (const [key, DocModel, docs] of collections) {
        if (docs.length > 0) {
            const rehomed = docs.map((doc) => ({ ...doc, userId: uid }));
            await DocModel.insertMany(rehomed, { session, ordered: true });
        }
        counts[key] = docs.length;
    }

    await User.findByIdAndUpdate(uid, {
        currency: payload.preferences.currency,
        "prefs.timeZone": payload.preferences.timeZone,
        "prefs.notifications": payload.preferences.notifications,
        "prefs.defaultAccount": payload.preferences.defaultAccount
            ? new mongoose.Types.ObjectId(payload.preferences.defaultAccount)
            : null,
    }, { session });

    return counts;
};

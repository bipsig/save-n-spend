import mongoose, { ClientSession, Model } from "mongoose";
import User from "../models/User";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Budget from "../models/Budget";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import { BackupPayload } from "../schemas/backupSchema";

const BACKUP_VERSION = 1;

// Everything the user entered themselves, byte-for-byte. HighlightLog and Notification
// are deliberately excluded — both are derived from this same data and regenerate on
// their own after a restore; bringing them back would restore a stale audit trail, not
// real data. `password`/`resetToken`/`resetTokenExpiry`/`totpSecret`/`googleId`/
// `pushToken`/`totpEnabled` never leave this function: `.lean()` skips User's own toJSON
// transform entirely, so they are excluded here explicitly via `.select()`, not assumed.
export const exportAccountData = async (userId: string) => {
    const uid = new mongoose.Types.ObjectId(userId);

    const [user, accounts, categories, transactions, budgets, bills, goals] = await Promise.all([
        User.findById(uid).select("currency prefs").lean(),
        Account.find({ userId: uid }).lean(),
        Category.find({ userId: uid }).lean(),
        Transaction.find({ userId: uid }).lean(),
        Budget.find({ userId: uid }).lean(),
        Bill.find({ userId: uid }).lean(),
        Goal.find({ userId: uid }).lean(),
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
    };
};

type Collection = [string, Model<any>, Record<string, unknown>[]];

// Wipes every one of THIS user's own documents across the six collections and replaces
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

    await Promise.all([
        Account.deleteMany({ userId: uid }, { session }),
        Category.deleteMany({ userId: uid }, { session }),
        Transaction.deleteMany({ userId: uid }, { session }),
        Budget.deleteMany({ userId: uid }, { session }),
        Bill.deleteMany({ userId: uid }, { session }),
        Goal.deleteMany({ userId: uid }, { session }),
    ]);

    const collections: Collection[] = [
        ["accounts", Account, payload.accounts],
        ["categories", Category, payload.categories],
        ["transactions", Transaction, payload.transactions],
        ["budgets", Budget, payload.budgets],
        ["bills", Bill, payload.bills],
        ["goals", Goal, payload.goals],
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

import mongoose from "mongoose";
import { ITransaction } from "../models/Transaction";
import Account from "../models/Account";
import { AppError } from "../utils/AppError";

type Effect = {
    account: mongoose.Types.ObjectId,
    delta: number
}

export const getEffectOf = (transaction: ITransaction): Effect[] => {

    switch (transaction.type) {
        case "expense":
        case "negativeAdjustment":
            return [{ account: transaction.account, delta: -transaction.amount }]

            case "income":
            case "positiveAdjustment":
            return [{ account: transaction.account, delta: transaction.amount }]

        case "transfer":
            return [
                { account: transaction.account, delta: -transaction.amount },
                { account: transaction.toAccount!, delta: transaction.amount }
            ]

        default:
            return [];
    }
}

export const applyEffects = async (
    transaction: ITransaction,
    action: "add" | "revert",
    session: mongoose.ClientSession
): Promise<void> => {
    const direction = action === "add" ? 1 : -1;
    
    const effects = getEffectOf(transaction);
    for (const { account, delta } of effects) {
        const { matchedCount } = await Account.updateOne(
            { _id: account, userId: transaction.userId },
            { $inc: { balance: direction*delta }},
            { session }
        );
        if (matchedCount === 1) continue;
        // Taking a row off an account that no longer exists has no balance to undo, so it
        // stays allowed (older data holds such rows). Anything else — a new effect on a
        // missing account, or any effect on another user's — rolls the whole write back.
        if (action === "revert" && !(await Account.exists({ _id: account }).session(session))) continue;
        throw AppError.notFound("Account not found");
    }
}
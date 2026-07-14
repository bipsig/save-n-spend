import mongoose from "mongoose";
import { ITransaction } from "../models/Transaction";
import Account from "../models/Account";

type Effect = {
    account: mongoose.Types.ObjectId,
    delta: number
}

export const getEffectOf = (transaction: ITransaction): Effect[] => {

    switch (transaction.type) {
        case "expense":
            return [{ account: transaction.account, delta: -transaction.amount }]

        case "income":
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
        await Account.updateOne(
            { _id: account },
            { $inc: { balance: direction*delta }},
            { session }
        );
    }
}
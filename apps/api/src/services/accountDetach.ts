import type { ClientSession } from "mongoose";
import Bill from "../models/Bill";
import User from "../models/User";

/**
 * What archiving or deleting an account leaves pointing at it (gaps row 6): it stops being the
 * default, and bills charged to it fall back to the default when paid. A SIP into a holding
 * that is archived is paused; one into a holding that is deleted goes with it. Returns how
 * many SIP bills were deleted.
 */
export const detachAccount = async (userId: string, accountId: unknown, how: "archive" | "delete", session: ClientSession): Promise<number> => {
    await User.updateOne({ _id: userId, "prefs.defaultAccount": accountId }, { $set: { "prefs.defaultAccount": null } }, { session });
    await Bill.updateMany({ userId, account: accountId }, { $unset: { account: 1 } }, { session });
    if (how === "delete") return (await Bill.deleteMany({ userId, toInvestment: accountId }, { session })).deletedCount ?? 0;
    await Bill.updateMany({ userId, toInvestment: accountId, pausedAt: null }, { $set: { pausedAt: new Date() } }, { session });
    return 0;
};

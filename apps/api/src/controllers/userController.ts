import { updateMeSchema } from "../schemas/userSchema"
import { Request, Response } from 'express';
import mongoose from "mongoose";
import * as reply from '../utils/response';
import User from "../models/User";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Budget from "../models/Budget";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import { AppError } from "../utils/AppError";

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  reply.ok(res, user, "Profile fetched successfully");
}

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const data = updateMeSchema.parse(req.body);

  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  if (data.name !== undefined) {
    user.name = data.name;
  }

  if (data.pushToken !== undefined) {
    // Explicit null means "this device is signing out" — unset rather than store null,
    // so the reminder job's `pushToken` check stays a plain existence test.
    if (data.pushToken === null) {
      user.set("pushToken", undefined);
    }
    else {
      user.pushToken = data.pushToken;
    }
  }

  if (data.prefs) {
    const { notifications, ...rest } = data.prefs;

    if (notifications) {
        user.prefs.notifications = {...user.prefs.notifications, ...notifications};
    }

    if (rest.defaultAccount !== undefined) {
        // An id from the request body is untrusted: without this check a user
        // could point their default at another user's account, and every screen
        // that preselects it would then read a stranger's balance.
        if (rest.defaultAccount !== null) {
          const account = await Account.findOne({
            _id: rest.defaultAccount,
            userId: user._id,
            isArchived: false
          });

          if (!account) {
            throw AppError.notFound("Account not found");
          }
        }
        user.set("prefs.defaultAccount", rest.defaultAccount);
    }

    if (rest.timeZone !== undefined) {
        user.prefs.timeZone = rest.timeZone;
    }
  }
  await user.save();

  reply.ok(res, user, "Profile Updated");
}

// Erase the account and everything it owns. Unlike the per-resource DELETEs —
// which archive so a transaction keeps its history — this is a real deletion:
// the user asked for their data to be gone, so leaving archived rows behind
// would defeat the point. One transaction, so a partial wipe can't strand
// orphaned documents under a user id that no longer exists.
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  const user = await User.findById(userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Transaction.deleteMany({ userId }, { session });
      await Budget.deleteMany({ userId }, { session });
      await Bill.deleteMany({ userId }, { session });
      await Goal.deleteMany({ userId }, { session });
      await Account.deleteMany({ userId }, { session });
      await Category.deleteMany({ userId }, { session });
      await User.deleteOne({ _id: userId }, { session });
    });
  }
  finally {
    session.endSession();
  }

  reply.noContent(res, "Account deleted");
}

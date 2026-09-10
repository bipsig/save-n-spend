import { updateMeSchema } from "../schemas/userSchema"
import { Request, Response } from 'express';
import * as reply from '../utils/response';
import User from "../models/User";
import Account from "../models/Account";
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

// Deactivate the account. Nothing is erased.
//
// The common reason to tap this is "I'm done with this app for now", and years of a person's
// spending history is not recoverable from anywhere else. So the row and everything it owns
// stay put, and signing in again clears `deactivatedAt` and hands it all back (see
// authController).
//
// What does happen immediately:
//   - `deactivatedAt` is stamped, which locks the account out of `/auth/me` and so out
//     of the app, and drops it from the reminder job's sweep.
//   - `pushToken` is unset, because a deactivated account must not keep sending
//     notifications to a phone whose owner believes they left.
//
// Per-resource DELETEs archive rather than erase, so this matches the rest of the API.
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  const user = await User.findById(userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  user.deactivatedAt = new Date();
  user.set("pushToken", undefined);

  await user.save();

  reply.noContent(res, "Account deactivated");
}

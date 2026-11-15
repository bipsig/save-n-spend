import { Request, Response } from 'express';
import type { Valid } from "../middleware/validate";
import { AUTH_MESSAGES } from "../middleware/authMiddleware";
import { updateMeSchemas } from "../schemas/userSchema";
import * as reply from '../utils/response';
import User from "../models/User";
import Account from "../models/Account";
import { AppError } from "../utils/AppError";
import { toDTO } from "../utils/dto";

// `protect` has already checked the user exists and isn't closed; this covers the moment
// between that check and the handler.
const signInAgain = () => new AppError(401, AUTH_MESSAGES.signIn, { code: "unauthenticated" });

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw signInAgain();
  }

  reply.ok(res, toDTO(user), "Profile fetched");
}

/** The PATCH as one update document. Every field is its own dotted path, so two requests that
 *  change different settings at once (three switches flipped quickly) both land. */
export const profileUpdate = (body: Valid<typeof updateMeSchemas>["body"]) => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (body.name !== undefined) $set.name = body.name;

  // Explicit null means "this device is signing out" — unset rather than store null,
  // so the reminder job's `pushToken` check stays a plain existence test.
  if (body.pushToken === null) $unset.pushToken = 1;
  else if (body.pushToken !== undefined) $set.pushToken = body.pushToken;

  const { notifications, defaultAccount, timeZone } = body.prefs ?? {};
  for (const [key, value] of Object.entries(notifications ?? {})) {
    if (value !== undefined) $set[`prefs.notifications.${key}`] = value;
  }
  if (defaultAccount !== undefined) $set["prefs.defaultAccount"] = defaultAccount;
  if (timeZone !== undefined) $set["prefs.timeZone"] = timeZone;

  return { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) };
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const { body } = req.valid as Valid<typeof updateMeSchemas>;
  const userId = req.user!.userId;

  const defaultAccount = body.prefs?.defaultAccount;
  if (defaultAccount) {
    // An id from the request body is untrusted: without this check a user
    // could point their default at another user's account, and every screen
    // that preselects it would then read a stranger's balance.
    const account = await Account.exists({ _id: defaultAccount, userId, isArchived: false });
    if (!account) {
      throw AppError.invalidReference("prefs.defaultAccount", "The default account", "accounts");
    }
  }

  if (body.pushToken) {
    // A phone's token belongs to whoever signed in on it last. If an earlier user's sign-out
    // couldn't detach it, they would keep getting reminders, amounts included, on a phone
    // someone else now uses.
    await User.updateMany({ _id: { $ne: userId }, pushToken: body.pushToken }, { $unset: { pushToken: 1 } });
  }

  const update = profileUpdate(body);
  const user = Object.keys(update).length
    ? await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true })
    : await User.findById(userId);

  if (!user) {
    throw signInAgain();
  }

  reply.ok(res, toDTO(user), "Profile updated");
}

// Deactivate the account. Nothing is erased.
//
// The common reason to tap this is "I'm done with this app for now", and years of a person's
// spending history is not recoverable from anywhere else. So the row and everything it owns
// stay put, and signing in again clears `deactivatedAt` and hands it all back (see
// authController).
//
// What does happen immediately:
//   - `deactivatedAt` is stamped, which makes `protect` turn every request with an existing
//     token away, and drops it from the reminder job's sweep.
//   - `pushToken` is unset, because a deactivated account must not keep sending
//     notifications to a phone whose owner believes they left.
//
// Per-resource DELETEs archive rather than erase, so this matches the rest of the API.
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  const user = await User.findById(userId);

  if (!user) {
    throw signInAgain();
  }

  user.deactivatedAt = new Date();
  user.set("pushToken", undefined);

  await user.save();

  reply.noContent(res, "Account deactivated");
}

import { updateMeSchema } from "../schemas/userSchema"
import { Request, Response } from 'express';
import * as reply from '../utils/response';
import User from "../models/User";
import { AppError } from "../utils/AppError";

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const data = updateMeSchema.parse(req.body);

  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  if (data.pushToken !== undefined) {
    user.pushToken = data.pushToken;
  }

  if (data.prefs) {
    const { notifications, ...rest } = data.prefs;

    if (notifications) {
        user.prefs.notifications = {...user.prefs.notifications, ...notifications};
    }

    if (rest.defaultAccount !== undefined) {
        user.set("prefs.defaultAccount", rest.defaultAccount);
    }

    if (rest.budgetCycleDay !== undefined) {
        user.prefs.budgetCycleDay = rest.budgetCycleDay;
    }
  }
  await user.save();

  reply.ok(res, user, "Profile Updated");
}
import mongoose from "mongoose";
import User from "../models/User";
import { notify, type NotifiableUser } from "./notificationService";
import { formatAmount } from "../utils/money";

// The other event-driven alert: a milestone is worth celebrating at the moment it is
// crossed, while the user is still looking at the goal they just paid into.

// Quarters, because they are the points a progress ring makes obvious. Ascending.
const MILESTONES = [25, 50, 75, 100];

/**
 * Notifies about the highest milestone this contribution crossed.
 *
 * Highest, not each: someone who saves half their target in one go has crossed 25% and
 * 50%, and two buzzes for one action reads as a bug. `savedBefore` is what makes this
 * "crossed" rather than "is above" — without it, every later contribution would re-fire
 * every milestone below it (the dedupe key would catch that, but only until the 90-day
 * TTL rolled it off).
 */
export const checkGoalMilestone = async (
    goal: { _id: mongoose.Types.ObjectId | string; userId: mongoose.Types.ObjectId | string; name: string; target: number; saved: number },
    savedBefore: number,
): Promise<void> => {
    try {
        if (goal.target <= 0) return;

        const before = (savedBefore / goal.target) * 100;
        const after = (goal.saved / goal.target) * 100;

        const crossed = MILESTONES.filter((m) => before < m && after >= m).pop();
        if (!crossed) return;

        const user = await User.findById(goal.userId)
            .select("currency pushToken prefs.notifications")
            .lean();
        if (!user) return;

        const done = crossed === 100;

        await notify(user as NotifiableUser, {
            type: "goalMilestone",
            title: done ? `${goal.name} is fully funded 🎉` : `${goal.name} is ${crossed}% there`,
            body: done
                ? `You've saved the whole ${formatAmount(goal.target, user.currency)}.`
                : `${formatAmount(goal.saved, user.currency)} of ${formatAmount(goal.target, user.currency)} saved.`,
            dedupeKey: `goal:${String(goal._id)}:milestone:${crossed}`,
            link: { screen: "goals", id: String(goal._id) },
        });
    }
    catch (err) {
        console.error(`[alerts] goal milestone check failed for goal ${String(goal._id)}`, err);
    }
}

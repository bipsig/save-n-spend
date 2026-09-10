import mongoose from "mongoose";
import Notification, { type NotificationType } from "../models/Notification";
import User, { type INotificationPrefs } from "../models/User";
import { sendPush } from "./pushService";

// The one door every notification goes through, whatever raised it. Three steps, and the
// order is the design: check preferences, write the in-app record (whose unique dedupe key
// makes "once" mean once), then push. Pushing last and only on a first write is what stops
// a retried job from buzzing a phone twice, and it makes the in-app feed the source of
// truth for anyone who denied push permission.

export type NotifyInput = {
    type: NotificationType;
    title: string;
    body: string;
    /** Must be stable for the occasion — see Notification.dedupeKey. */
    dedupeKey: string;
    link?: { screen: string; id?: string };
};

/** The little the notifier needs to know about a user — so a cron tick can pass a
 *  lean projection instead of a hydrated document. */
export type NotifiableUser = {
    _id: mongoose.Types.ObjectId | string;
    pushToken?: string;
    prefs?: { notifications?: Partial<INotificationPrefs> };
};

/**
 * Which switch in Settings governs which kind. Bill reminders have none of their own —
 * their setting is the lead time — so they answer to the primary switch alone.
 *
 * Exported so a caller can ask before doing the work of composing one: `notify` checks
 * this too, but by then the budgets have been aggregated.
 */
export const wantsNotification = (prefs: Partial<INotificationPrefs> | undefined, type: NotificationType): boolean => {
    if (prefs?.enabled === false) return false;

    switch (type) {
        case "budgetWarning":
        case "budgetExceeded":
            return prefs?.budgetAlerts !== false;
        case "goalMilestone":
        case "goalDeadline":
            return prefs?.goalMilestones !== false;
        // Opt-in: the daily one would arrive 365 times a year.
        case "dailySummary":
            return prefs?.dailySummary === true;
        case "weeklySummary":
            return prefs?.weeklySummary === true;
        case "monthlySummary":
            // On by default, unlike its siblings — twelve a year is a fair assumption.
            return prefs?.monthlySummary !== false;
        case "billReminder":
        case "billOverdue":
            return true;
        default:
            return true;
    }
};

const DUPLICATE_KEY = 11000;

/**
 * Delivers one notification to one user. True only when this call is the one that created
 * it; false means preferences said no, or the occasion was already notified. Never throws
 * — callers include a POST that has already committed money.
 */
export const notify = async (user: NotifiableUser, input: NotifyInput): Promise<boolean> => {
    try {
        if (!wantsNotification(user.prefs?.notifications, input.type)) return false;

        await Notification.create({
            userId: user._id,
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link,
            dedupeKey: input.dedupeKey,
        });

        if (!user.pushToken) return true;

        // The badge is the total the phone should show once this lands, not this
        // notification's own count — iOS replaces the badge rather than adding to it.
        const unread = await Notification.countDocuments({ userId: user._id, readAt: null });

        const pushed = await sendPush({
            token: user.pushToken,
            title: input.title,
            body: input.body,
            badge: unread,
            data: input.link ? { link: input.link } : undefined,
        });

        if (pushed) {
            await Notification.updateOne(
                { userId: user._id, dedupeKey: input.dedupeKey },
                { pushedAt: new Date() },
            );
        }
        return true;
    }
    catch (err) {
        // A duplicate key is the healthy outcome of evaluating the same occasion twice.
        if ((err as { code?: number }).code === DUPLICATE_KEY) return false;
        console.error(`[notify] ${input.type} failed for user ${String(user._id)}`, err);
        return false;
    }
};

/** The same, for callers holding only an id. One projected lookup, so no controller has
 *  to learn which fields the notifier needs. */
export const notifyUserId = async (
    userId: string | mongoose.Types.ObjectId,
    input: NotifyInput,
): Promise<boolean> => {
    try {
        const user = await User.findById(userId)
            .select("pushToken prefs.notifications")
            .lean();
        if (!user) return false;
        return notify(user as NotifiableUser, input);
    }
    catch (err) {
        console.error(`[notify] could not load user ${String(userId)}`, err);
        return false;
    }
};

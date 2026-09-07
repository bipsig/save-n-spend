import mongoose from "mongoose";
import Notification, { type NotificationType } from "../models/Notification";
import User, { type INotificationPrefs } from "../models/User";
import { sendPush } from "./pushService";

// The one door every notification goes through, whatever raised it — a cron tick, a
// transaction that crossed a budget, a goal contribution.
//
// It does three things in a fixed order, and the order is the design:
//
//   1. asks the user's preferences whether this kind is wanted at all,
//   2. writes the in-app record, whose unique dedupe key is what makes "once" mean once,
//   3. and only then pushes.
//
// Push last, and only if the write was the first one, is what stops a retried job or a
// second instance from buzzing a phone twice. It also means the in-app feed is the
// source of truth: a user who denied push permission still gets every notification,
// they just have to open the app to see them.

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
 * Which switch in Settings governs which kind. Bill reminders have no switch of their
 * own — their setting is the lead time, and "never" isn't one of the choices — so they
 * answer to the master switch alone.
 *
 * Exported so a caller that would have to do real work to compose a notification can
 * ask first: `notify` checks this too, but by then the budgets have been aggregated.
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
        // The two opt-in kinds. A digest nobody asked for is the notification people
        // uninstall an app over, and the daily one would arrive 365 times a year.
        case "dailySummary":
            return prefs?.dailySummary === true;
        case "weeklySummary":
            return prefs?.weeklySummary === true;
        case "monthlySummary":
            // On by default, unlike its siblings: twelve a year, on the one morning the
            // month just ended, is a reasonable thing for a money app to assume is wanted.
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
 * Delivers one notification to one user.
 *
 * Returns true only when this call is the one that created it — false means the
 * preferences said no, or the same occasion had already been notified. Never throws:
 * callers include a POST that has already committed money, and a failed nudge must not
 * turn a successful write into a 500.
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
        // A duplicate key is the expected, healthy outcome of evaluating the same
        // occasion twice — not something to log.
        if ((err as { code?: number }).code === DUPLICATE_KEY) return false;
        console.error(`[notify] ${input.type} failed for user ${String(user._id)}`, err);
        return false;
    }
};

/**
 * The same, for callers that hold only an id — the request handlers. One projected
 * lookup, because the alternative is every controller learning which fields the
 * notifier needs.
 */
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

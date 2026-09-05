import cron from "node-cron";
import mongoose from "mongoose";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import Transaction from "../models/Transaction";
import User from "../models/User";
import { daysUntilDue, isSettledForPeriod } from "../services/billService";
import { notify, wantsNotification, type NotifiableUser } from "../services/notificationService";
import { formatAmount } from "../utils/money";
import { addDaysInZone, dayKeyInZone, normalizeZone, partsInZone, startOfWeekInZone } from "../utils/timezone";

// The scheduled half of notifications: the nudges nobody's action triggers — a bill due
// on Friday, a goal deadline next week, last week's summary.
//
// The tick is hourly in whatever zone the server happens to run in, and every decision
// inside it is made against each user's OWN wall clock. That is the whole design: a job
// has no request to read a zone off, so it reads each user's `prefs.timeZone`, and a
// reminder meant for 9am arrives at 9am in Delhi and at 9am in Berlin off one schedule.

/** No reminder is sent before 9am local — an overdue bill at 3am is not a kindness. */
const SEND_HOUR = 9;

/** How far ahead a goal deadline starts being mentioned. */
const DEADLINE_WINDOW_DAYS = 7;

const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? "" : "s"}`;

/** "12 Sep", read in the user's zone — the date they'd see on the bill itself. */
const dateLabel = (instant: Date, zone: string): string =>
    new Intl.DateTimeFormat("en-IN", { timeZone: zone, day: "numeric", month: "short" }).format(instant);

/** The lean projection every reminder below works from. */
type ReminderUser = {
    _id: mongoose.Types.ObjectId;
    currency?: string;
    pushToken?: string;
    prefs?: {
        timeZone?: string;
        notifications?: {
            enabled?: boolean;
            billReminderLead?: number;
            budgetAlerts?: boolean;
            goalMilestones?: boolean;
            weeklySummary?: boolean;
        };
    };
};

const remindBills = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    // A non-recurring bill that has been paid is `status: "paid"` forever; a recurring one
    // never is — its due date rolls forward instead — so the settled-this-period check
    // below is what stops this month's electricity being nudged after it was paid.
    const bills = await Bill.find({ userId: user._id, status: { $ne: "paid" } }).lean();

    for (const bill of bills) {
        if (isSettledForPeriod(bill, now, zone)) continue;

        const days = daysUntilDue(bill.dueDate, now, zone);
        const amount = formatAmount(bill.amount, user.currency);
        // Keyed by the DUE DATE, not by today: one nudge per occasion, and a recurring
        // bill's next period is a new key without any state to reset.
        const due = dayKeyInZone(bill.dueDate, zone);
        const lead = bill.reminderDays ?? user.prefs?.notifications?.billReminderLead ?? 3;

        if (days < 0) {
            await notify(user as NotifiableUser, {
                type: "billOverdue",
                title: `${bill.name} is overdue`,
                body: `${amount} was due ${plural(-days, "day")} ago.`,
                dedupeKey: `bill:${String(bill._id)}:overdue:${due}`,
                link: { screen: "bills", id: String(bill._id) },
            });
            continue;
        }

        if (days === 0) {
            // Its own key, so someone reminded three days early still hears about it on
            // the morning it is actually due — which is the one that gets it paid.
            await notify(user as NotifiableUser, {
                type: "billReminder",
                title: `${bill.name} is due today`,
                body: `${amount} due today.`,
                dedupeKey: `bill:${String(bill._id)}:today:${due}`,
                link: { screen: "bills", id: String(bill._id) },
            });
            continue;
        }

        if (days <= lead) {
            await notify(user as NotifiableUser, {
                type: "billReminder",
                title: `${bill.name} due in ${plural(days, "day")}`,
                body: `${amount} due on ${dateLabel(bill.dueDate, zone)}.`,
                dedupeKey: `bill:${String(bill._id)}:due:${due}`,
                link: { screen: "bills", id: String(bill._id) },
            });
        }
    }
};

const remindGoalDeadlines = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "goalDeadline")) return;

    const goals = await Goal.find({
        userId: user._id,
        deadline: { $exists: true, $ne: null },
    }).lean();

    for (const goal of goals) {
        // Nothing to warn about on a goal that is already funded.
        if (!goal.deadline || goal.saved >= goal.target) continue;

        const days = daysUntilDue(goal.deadline, now, zone);
        if (days < 0 || days > DEADLINE_WINDOW_DAYS) continue;

        const short = formatAmount(goal.target - goal.saved, user.currency);

        await notify(user as NotifiableUser, {
            type: "goalDeadline",
            title: days === 0
                ? `${goal.name} is due today`
                : `${goal.name} is due in ${plural(days, "day")}`,
            body: `${short} still to go.`,
            dedupeKey: `goal:${String(goal._id)}:deadline:${dayKeyInZone(goal.deadline, zone)}`,
            link: { screen: "goals", id: String(goal._id) },
        });
    }
};

const sendWeeklySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "weeklySummary")) return;

    // The week that just ended, in the user's zone: this Monday's midnight bounds it, and
    // the Monday before opens it.
    const end = startOfWeekInZone(now, zone);
    const start = addDaysInZone(end, zone, -7);

    const sums = await Transaction.aggregate([
        {
            $match: {
                userId: user._id,
                type: { $in: ["income", "expense"] },
                occurredAt: { $gte: start, $lt: end },
            }
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    const income = sums.find((row) => row._id === "income")?.total ?? 0;
    const expense = sums.find((row) => row._id === "expense")?.total ?? 0;

    // A digest of a week with nothing in it is the definition of a notification worth
    // not sending.
    if (income === 0 && expense === 0) return;

    const net = income - expense;

    await notify(user as NotifiableUser, {
        type: "weeklySummary",
        title: "Your week in review",
        body: `Spent ${formatAmount(expense, user.currency)}, earned ${formatAmount(income, user.currency)}`
            + (net >= 0
                ? ` — ${formatAmount(net, user.currency)} put aside.`
                : ` — ${formatAmount(-net, user.currency)} more than you earned.`),
        dedupeKey: `weekly:${dayKeyInZone(end, zone)}`,
        link: { screen: "insights" },
    });
};

/**
 * One pass over every user who hasn't switched notifications off.
 *
 * `now` is a parameter so this can be driven from a script or a test at an arbitrary
 * instant — nothing inside reads the clock again.
 *
 * A full scan is honest for an app of this size and keeps the schedule to one cron
 * entry; if the user count ever makes that expensive, the shape to move to is a query
 * per zone-offset bucket rather than a per-user job.
 */
export const runReminders = async (now: Date = new Date()): Promise<void> => {
    const users = await User.find({ "prefs.notifications.enabled": { $ne: false } })
        .select("currency pushToken prefs.timeZone prefs.notifications")
        .lean();

    for (const user of users) {
        try {
            const zone = normalizeZone(user.prefs?.timeZone);
            const { hour, weekday } = partsInZone(now, zone);

            // `>=` rather than `===` on purpose: a restart or a slow tick can swallow the
            // 9 o'clock hour entirely, and a reminder that arrives at 10 is worth far more
            // than one that never arrives. Sending twice is what the dedupe keys prevent,
            // so the window can be generous.
            if (hour < SEND_HOUR) continue;

            await remindBills(user as ReminderUser, zone, now);
            await remindGoalDeadlines(user as ReminderUser, zone, now);

            // Monday, where the user is.
            if (weekday === 1) {
                await sendWeeklySummary(user as ReminderUser, zone, now);
            }
        }
        catch (err) {
            // One user's bad data must not stop the other users' reminders.
            console.error(`[reminders] failed for user ${String(user._id)}`, err);
        }
    }
};

/**
 * Starts the hourly tick. Called once, after the DB connection is up.
 *
 * Hourly rather than daily because "9am" means twenty-something different instants
 * across the zone database, and the only schedule that covers all of them is one that
 * wakes up every hour and asks each user what time it is for them.
 */
export const startReminderJob = (): void => {
    // Set on a machine that shares the database with the real one — a second dev server
    // otherwise sends the production users' reminders from a laptop.
    if (process.env.DISABLE_REMINDERS === "true") {
        console.log("Reminder job disabled (DISABLE_REMINDERS=true)");
        return;
    }

    cron.schedule("0 * * * *", () => {
        void runReminders().catch((err) => {
            console.error("[reminders] tick failed", err);
        });
    });

    console.log("Reminder job scheduled (hourly)");
};

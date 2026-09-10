import cron from "node-cron";
import mongoose from "mongoose";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import Transaction from "../models/Transaction";
import User from "../models/User";
import { daysUntilDue, isSettledForPeriod } from "../services/billService";
import { notify, wantsNotification, type NotifiableUser } from "../services/notificationService";
import { formatAmount } from "../utils/money";
import {
    addDaysInZone,
    addMonthsInZone,
    dayKeyInZone,
    monthLabelInZone,
    normalizeZone,
    partsInZone,
    startOfDayInZone,
    startOfMonthInZone,
    startOfWeekInZone,
} from "../utils/timezone";

// The scheduled half of notifications: the nudges nobody's action triggers — a bill due
// on Friday, a goal deadline next week, yesterday's spending, last month's wrap-up.
//
// The tick is hourly in whatever zone the server happens to run in, and every decision
// inside it is made against each user's OWN wall clock. That is the whole design: a job
// has no request to read a zone off, so it reads each user's `prefs.timeZone`, and a
// reminder meant for 6pm arrives at 6pm in Delhi and at 6pm in Berlin off one schedule.

/**
 * No reminder is sent before 6pm local — an overdue bill at 3am is not a kindness.
 *
 * Evening rather than morning is a hosting constraint wearing the costume of a product
 * decision. Render's free tier spins an idle instance down and takes 50s or more to come
 * back, longer than any free uptime pinger will hold a request open — so a pinger can keep
 * the service awake but cannot wake it, which makes the first hour of the day the least
 * reliable moment to promise anything. By 6pm the instance has been up for hours. These
 * four constants are the only thing to change if the API ever leaves the free tier.
 */
const SEND_HOUR = 18;

/**
 * Each digest gets its own hour.
 *
 * The 1st of a month can be a Monday, and on that evening all three periods have just
 * closed at once. Sent together they arrive as a stack of three pushes that look like a
 * bug; an hour apart they read as what they are — yesterday, then the week, then the
 * month. Bills and goals keep 6pm with the daily digest because they are about what is
 * coming rather than what happened, so they don't compete for the same attention.
 *
 * These are floors, not exact times: the `hour >=` comparison below is deliberate (see
 * the note there), so a server that was down all day still delivers all three on the
 * first tick it manages — bunched, but delivered. Bunching on the recovery path is the
 * right trade against silence. 8pm still leaves the monthly digest three hours of slack
 * before the uptime window closes.
 */
const DAILY_HOUR = 18;
const WEEKLY_HOUR = 19;
const MONTHLY_HOUR = 20;

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
            dailySummary?: boolean;
            weeklySummary?: boolean;
            monthlySummary?: boolean;
        };
    };
};

/** What every digest is made of: the money that moved in a closed period, and how many
 *  times it moved. Transfers and adjustments are excluded exactly as insights excludes
 *  them — a digest that counted a transfer as income would be reporting a fiction. */
type PeriodFlows = { income: number; expense: number; count: number };

const flowsBetween = async (
    userId: mongoose.Types.ObjectId,
    start: Date,
    end: Date,
): Promise<PeriodFlows> => {
    const rows = await Transaction.aggregate<{ _id: "income" | "expense"; total: number; count: number }>([
        {
            $match: {
                userId,
                type: { $in: ["income", "expense"] },
                occurredAt: { $gte: start, $lt: end },
            },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    return {
        income: rows.find((row) => row._id === "income")?.total ?? 0,
        expense: rows.find((row) => row._id === "expense")?.total ?? 0,
        count: rows.reduce((sum, row) => sum + row.count, 0),
    };
};

/** "Spent ₹1,200, earned ₹0 — ₹1,200 more than you earned." The one sentence all three
 *  digests end with, so the family reads consistently however often it arrives. */
const flowLine = (flows: PeriodFlows, currency?: string): string => {
    const net = flows.income - flows.expense;
    return `Spent ${formatAmount(flows.expense, currency)}, earned ${formatAmount(flows.income, currency)}`
        + (net >= 0
            ? ` — ${formatAmount(net, currency)} put aside.`
            : ` — ${formatAmount(-net, currency)} more than you earned.`);
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
            // the day it is actually due — which is the one that gets it paid.
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

const sendDailySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "dailySummary")) return;

    // Yesterday, in the user's zone: today's midnight closes it, the midnight before
    // opens it. Never "the last 24 hours" — a digest headed "Yesterday" that includes
    // today's lunch is a digest the reader can prove wrong.
    const end = startOfDayInZone(now, zone);
    const start = addDaysInZone(end, zone, -1);

    const flows = await flowsBetween(user._id, start, end);

    // A day with nothing in it is the most common day there is, and the surest way to
    // train someone to swipe these away unread. Silence is the correct digest.
    if (flows.count === 0) return;

    await notify(user as NotifiableUser, {
        type: "dailySummary",
        // Names the date rather than saying "Yesterday": the push may be read at
        // lunchtime, or a day late after an outage, and the date is still true then.
        title: `${dateLabel(start, zone)} in review`,
        body: `${flowLine(flows, user.currency)} ${plural(flows.count, "transaction")}.`,
        // Keyed by the DAY COVERED, not by today, so a re-run or a second instance
        // evaluating the same day lands on the same key.
        dedupeKey: `daily:${dayKeyInZone(start, zone)}`,
        link: { screen: "insights" },
    });
};

const sendWeeklySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "weeklySummary")) return;

    // The week that just ended, in the user's zone: this Monday's midnight bounds it, and
    // the Monday before opens it.
    const end = startOfWeekInZone(now, zone);
    const start = addDaysInZone(end, zone, -7);

    const flows = await flowsBetween(user._id, start, end);

    // A digest of a week with nothing in it is the definition of a notification worth
    // not sending.
    if (flows.count === 0) return;

    await notify(user as NotifiableUser, {
        type: "weeklySummary",
        title: "Your week in review",
        body: flowLine(flows, user.currency),
        dedupeKey: `weekly:${dayKeyInZone(end, zone)}`,
        link: { screen: "insights" },
    });
};

/** The single most useful line in a monthly wrap-up: where the most of it went.
 *  Deliberately NOT rolled up into a parent category, unlike the insights breakdown —
 *  "Groceries" tells the reader more in a push than "Food & Dining" does. */
const topSpendCategory = async (
    userId: mongoose.Types.ObjectId,
    start: Date,
    end: Date,
): Promise<{ name: string; total: number } | null> => {
    const [top] = await Transaction.aggregate<{ total: number; category?: { name?: string }[] }>([
        {
            $match: {
                userId,
                type: "expense",
                category: { $ne: null },
                occurredAt: { $gte: start, $lt: end },
            },
        },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
        { $limit: 1 },
        // After the limit, so exactly one category document is ever read.
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
        { $project: { total: 1, "category.name": 1 } },
    ]);

    const name = top?.category?.[0]?.name;
    // Dropped rather than guessed at when the category has been deleted since: the rest
    // of the digest is still worth sending without this sentence.
    return name ? { name, total: top.total } : null;
};

const sendMonthlySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "monthlySummary")) return;

    // The month that just ended. Bounded by the two zone-local month starts rather than
    // by day arithmetic, so February and the month a DST change falls in need no case.
    const end = startOfMonthInZone(now, zone);
    const start = addMonthsInZone(end, zone, -1);

    const [flows, top] = await Promise.all([
        flowsBetween(user._id, start, end),
        topSpendCategory(user._id, start, end),
    ]);

    if (flows.count === 0) return;

    const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: zone, month: "long" }).format(start);

    await notify(user as NotifiableUser, {
        type: "monthlySummary",
        title: `${monthName} in review`,
        body: flowLine(flows, user.currency)
            + (top ? ` Most went to ${top.name} — ${formatAmount(top.total, user.currency)}.` : ""),
        // The label carries the year, so this key can never collide with the same month
        // next year even though the notification TTL would have re-armed it by then.
        dedupeKey: `monthly:${monthLabelInZone(start, zone)}`,
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
    // `deactivatedAt: null` matches both a live account and one written before the field
    // existed. Someone who deleted their account must stop hearing from it, even though
    // their data is still there waiting for them.
    const users = await User.find({
            "prefs.notifications.enabled": { $ne: false },
            deactivatedAt: null
        })
        .select("currency pushToken prefs.timeZone prefs.notifications")
        .lean();

    for (const user of users) {
        try {
            const zone = normalizeZone(user.prefs?.timeZone);
            const { hour, weekday, day } = partsInZone(now, zone);

            // `>=` rather than `===` on purpose: a restart or a slow tick can swallow the
            // 9 o'clock hour entirely, and a reminder that arrives at 10 is worth far more
            // than one that never arrives. Sending twice is what the dedupe keys prevent,
            // so the window can be generous.
            if (hour < SEND_HOUR) continue;

            await remindBills(user as ReminderUser, zone, now);
            await remindGoalDeadlines(user as ReminderUser, zone, now);

            // The three digests, each behind its own hour so a Monday the 1st delivers
            // them spread across the evening instead of as one stack of three.
            if (hour >= DAILY_HOUR) {
                await sendDailySummary(user as ReminderUser, zone, now);
            }

            // Monday, where the user is.
            if (weekday === 1 && hour >= WEEKLY_HOUR) {
                await sendWeeklySummary(user as ReminderUser, zone, now);
            }

            if (day === 1 && hour >= MONTHLY_HOUR) {
                await sendMonthlySummary(user as ReminderUser, zone, now);
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
 * Hourly rather than daily because "6pm" means twenty-something different instants
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

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

// The scheduled half of notifications: the nudges nobody's action triggers — a bill due on
// Friday, a goal deadline next week, yesterday's spending, last month's wrap-up.
//
// The tick is hourly, and every decision inside it is made against each user's OWN wall clock
// via `prefs.timeZone`, so one schedule delivers 6pm in Delhi and 6pm in Berlin.

/**
 * No reminder is sent before 6pm local. Evening rather than morning is a hosting constraint:
 * Render's free tier spins an idle instance down and takes 50s+ to return, longer than any free
 * pinger holds a request open — so a pinger keeps the service awake but cannot wake it, making
 * mornings the least reliable hour to promise anything. These four constants are all that need
 * to change if the API leaves the free tier.
 */
const SEND_HOUR = 18;

/**
 * Each digest gets its own hour, because the 1st can be a Monday — all three periods close on
 * the same evening, and sent together they look like a bug. Floors, not exact times: the
 * `hour >=` comparison below means a server down all day still delivers all three on the first
 * tick it manages, and 8pm leaves three hours of slack before the uptime window closes.
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

/** The money that moved in a closed period, and how many times. Transfers and adjustments
 *  are excluded exactly as insights excludes them. */
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

/** The one sentence all three digests end with, so they read consistently. */
const flowLine = (flows: PeriodFlows, currency?: string): string => {
    const net = flows.income - flows.expense;
    return `Spent ${formatAmount(flows.expense, currency)}, earned ${formatAmount(flows.income, currency)}`
        + (net >= 0
            ? ` — ${formatAmount(net, currency)} put aside.`
            : ` — ${formatAmount(-net, currency)} more than you earned.`);
};

const remindBills = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    // A recurring bill is never `status: "paid"` — its due date rolls forward instead — so
    // the settled-this-period check below is what stops a paid bill being nudged again.
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
            // Its own key, so someone reminded three days early still hears about it on the day.
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

    // Zone-local midnight bounds, never "the last 24 hours", which would leak most of a day of
    // today's spending into yesterday's digest.
    const end = startOfDayInZone(now, zone);
    const start = addDaysInZone(end, zone, -1);

    const flows = await flowsBetween(user._id, start, end);

    // An empty day is the most common day there is; silence is the correct digest.
    if (flows.count === 0) return;

    await notify(user as NotifiableUser, {
        type: "dailySummary",
        // The date, not "Yesterday", which stops being true if the push is read late.
        title: `${dateLabel(start, zone)} in review`,
        body: `${flowLine(flows, user.currency)} ${plural(flows.count, "transaction")}.`,
        // Keyed by the day COVERED, not today, so a re-run lands on the same key.
        dedupeKey: `daily:${dayKeyInZone(start, zone)}`,
        link: { screen: "insights" },
    });
};

const sendWeeklySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "weeklySummary")) return;

    // The week that just ended, bounded by the two zone-local Mondays.
    const end = startOfWeekInZone(now, zone);
    const start = addDaysInZone(end, zone, -7);

    const flows = await flowsBetween(user._id, start, end);

    if (flows.count === 0) return;

    await notify(user as NotifiableUser, {
        type: "weeklySummary",
        title: "Your week in review",
        body: flowLine(flows, user.currency),
        dedupeKey: `weekly:${dayKeyInZone(end, zone)}`,
        link: { screen: "insights" },
    });
};

/** Where the most of it went. Deliberately NOT rolled up to a parent category, unlike the
 *  insights breakdown — "Groceries" says more in a push than "Food & Dining". */
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
    // Dropped if the category was deleted since; the rest of the digest still sends.
    return name ? { name, total: top.total } : null;
};

const sendMonthlySummary = async (user: ReminderUser, zone: string, now: Date): Promise<void> => {
    if (!wantsNotification(user.prefs?.notifications, "monthlySummary")) return;

    // The two zone-local month starts, not day arithmetic, so February needs no special case.
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
        // The label carries the year, so this cannot collide with the same month next year.
        dedupeKey: `monthly:${monthLabelInZone(start, zone)}`,
        link: { screen: "insights" },
    });
};

/**
 * One pass over every user who hasn't switched notifications off. `now` is a parameter so a
 * script or test can drive this at an arbitrary instant — nothing inside reads the clock. A full
 * scan is fine at this size; the shape to move to is a query per zone-offset bucket.
 */
export const runReminders = async (now: Date = new Date()): Promise<void> => {
    // `deactivatedAt: null` matches a live account and one written before the field existed.
    // A deleted account must stop hearing from us even though its data is still there.
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

            // `>=` rather than `===` for catch-up: a restart can swallow the 6 o'clock hour,
            // and late beats never. Dedupe keys prevent the double send.
            if (hour < SEND_HOUR) continue;

            await remindBills(user as ReminderUser, zone, now);
            await remindGoalDeadlines(user as ReminderUser, zone, now);

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

/** Starts the hourly tick, once, after the DB connection is up. Hourly rather than daily
 *  because "6pm" is twenty-something different instants across the zone database. */
export const startReminderJob = (): void => {
    // Set on any machine sharing the real database, or a dev server sends production
    // reminders from a laptop.
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

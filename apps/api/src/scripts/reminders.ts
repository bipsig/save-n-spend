// Dev driver for the reminder job — one pass at an instant you choose, printing every
// notification it wrote. The job itself is hourly and gated on each user's own 6/7/8pm, so
// waiting for it to prove a change is not a workflow; `runReminders` takes `now` for this
// reason and nothing inside it reads the clock.
//
// Run:  npm run reminders --workspace=apps/api
//       npm run reminders --workspace=apps/api -- 2026-06-01T06:00:00Z
//
// 1 June 2026 at 06:00Z is a Monday the 1st in Delhi, the one day all three digests are due —
// the case the hour-per-digest stagger exists for.
//
// NOT destructive, but not harmless: it writes real notifications and sends real push, and
// claiming a dedupe key suppresses the deployed instance's own send for that occasion. Guarded
// against a production database the same way the seed is.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB, { resolveDbName } from "../config/db";
import Notification from "../models/Notification";
import User from "../models/User";
import { runReminders } from "../jobs/reminderJob";

const parseWhen = (arg?: string): Date => {
    if (!arg) return new Date();

    const when = new Date(arg);
    if (Number.isNaN(when.getTime())) {
        console.error(`Not a date I can read: "${arg}". Try an ISO string, e.g. 2026-06-01T06:00:00Z`);
        process.exit(1);
    }
    return when;
};

const run = async (): Promise<void> => {
    if (process.env.NODE_ENV === "production" || resolveDbName().includes("prod")) {
        console.error("Refusing to run: resolves to a production database.");
        process.exit(1);
    }

    const when = parseWhen(process.argv[2]);
    await connectDB();

    // The cutoff for "written by this pass". Read after connecting so a slow
    // handshake can't push it past the first write.
    const startedAt = new Date();

    console.log(`\nRunning reminders as of ${when.toISOString()} (db: ${resolveDbName()})\n`);
    await runReminders(when);

    const written = await Notification.find({ createdAt: { $gte: startedAt } })
        .sort({ userId: 1, createdAt: 1 })
        .lean();

    if (written.length === 0) {
        // Almost always one of three things, so say which rather than just "none".
        console.log("Nothing sent. Usually: the hour is too early in every user's zone,");
        console.log("the digest switch is off, the period was empty, or these occasions");
        console.log("were already notified (the dedupe keys are doing their job).\n");
    }
    else {
        const names = new Map(
            (await User.find().select("name email").lean())
                .map((user) => [String(user._id), `${user.name} <${user.email}>`]),
        );

        console.log(`Wrote ${written.length}:\n`);
        for (const row of written) {
            console.log(`  ${names.get(String(row.userId)) ?? String(row.userId)}`);
            console.log(`    [${row.type}] ${row.title}`);
            console.log(`    ${row.body}`);
            // `pushedAt` null means in-app only — no token, or push failed. On a
            // simulator that is every one of them, and it is not a fault.
            console.log(`    key: ${row.dedupeKey}  push: ${row.pushedAt ? "sent" : "in-app only"}\n`);
        }
    }

    await mongoose.disconnect();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

import { Request, Response } from "express";
import mongoose from "mongoose";
import Transaction from "../models/Transaction";
import User from "../models/User";
import HighlightLog from "../models/HighlightLog";
import { buildSnapshot, computeCurrentStreak } from "../services/highlightSnapshotService";
import { runHighlightRules, rankHighlightRules, buildLoggingStreakHighlight, type Highlight } from "../services/highlightRules";
import { normalizeZone, startOfDayInZone } from "../utils/timezone";
import { highlightHistoryQuerySchema } from "../schemas/highlightSchema";
import * as reply from "../utils/response";

/**
 * Writes the permanent record — one row per distinct `key`, forever, never updated once
 * written. `$setOnInsert` + upsert means a highlight recomputed on every poll (the normal
 * case) only ever inserts on the FIRST poll that produces it; every later poll under the
 * same key is a silent no-op, not a duplicate and not an update. A logging failure never
 * fails the request it rode in on — the live view is real either way.
 */
const logHighlights = async (userId: string, highlights: Highlight[]): Promise<void> => {
    if (highlights.length === 0) return;
    const oid = new mongoose.Types.ObjectId(userId);
    try {
        await HighlightLog.bulkWrite(
            highlights.map((h) => ({
                updateOne: {
                    filter: { userId: oid, key: h.key },
                    update: {
                        $setOnInsert: {
                            userId: oid, ruleId: h.ruleId, key: h.key, severity: h.severity,
                            title: h.title, body: h.body, materiality: h.materiality, screen: h.screen ?? null,
                        },
                    },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
    }
    catch (err) {
        console.error("failed to log highlights", err);
    }
};

// GET /highlights — the deterministic assistant (docs/insights-engine.md).
//
// Read-only by construction: nothing on this path writes, so no answer it gives can
// move a balance. And it is a leaf — no other feature calls it or depends on it, so
// if it ever has to be turned off, nothing else in the app notices.

/** The rules divide by history, and a brand-new account has none — a comparison
 *  against two weeks of data is noise dressed up as insight. Under these floors the
 *  endpoint says "warming up" instead of guessing. */
const MIN_HISTORY_DAYS = 14;
const MIN_EXPENSES = 10;

const WARMING_UP =
    "A few more weeks of transactions and this screen gets useful — there isn't enough history yet to compare against.";

const MS_PER_DAY = 86_400_000;

export const getHighlights = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const now = new Date();

    // One read covers both request-shaped facts: the zone every day-count below is
    // cut in, and the currency the rule copy is rendered in.
    const user = await User.findById(userId).select("currency prefs.timeZone").lean();
    const zone = normalizeZone(user?.prefs?.timeZone);
    const currency = user?.currency ?? "INR";

    const [first, expenseCount, streakDays] = await Promise.all([
        Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean(),
        Transaction.countDocuments({ userId, type: "expense" }),
        computeCurrentStreak(userId, zone, now),
    ]);

    const historyDays = first
        ? Math.round((startOfDayInZone(now, zone).getTime() - startOfDayInZone(first.occurredAt, zone).getTime()) / MS_PER_DAY)
        : 0;

    // The gate comes before the snapshot, so a warming account pays three cheap
    // queries instead of the whole assembly. The streak is exempted from it, computed
    // above regardless — the other nine rules genuinely need history to not be noise,
    // but a 3-day logging streak is just as true and just as worth saying on day 3 as
    // it is on day 300, which is precisely the moment this gate would otherwise hide it
    // for two weeks.
    if (!first || historyDays < MIN_HISTORY_DAYS || expenseCount < MIN_EXPENSES) {
        const streak = buildLoggingStreakHighlight(streakDays);
        await logHighlights(userId, streak ? [streak] : []);
        reply.ok(res, {
            highlights: streak ? [streak] : [],
            generatedAt: now.toISOString(),
            timeZone: zone,
            warmingUp: WARMING_UP,
        }, "Highlights fetched");
        return;
    }

    const snapshot = await buildSnapshot(userId, zone, currency, now, first.occurredAt, streakDays);
    // Every rule that fired gets a permanent record, not just the four shown live — see
    // logHighlights. `runHighlightRules` (used for the actual response) is just this same
    // ranking, capped.
    const ranked = rankHighlightRules(snapshot);
    await logHighlights(userId, ranked);
    const highlights = runHighlightRules(snapshot);

    reply.ok(res, {
        highlights,
        generatedAt: now.toISOString(),
        timeZone: zone,
    }, "Highlights fetched");
};

/**
 * The permanent, paginated history `getHighlights` above never keeps — every row here
 * was written once, at first occurrence, and is never edited or removed regardless of
 * whether the live view still shows it, dismisses it, or has long since stopped
 * generating it. Newest first.
 */
export const getHighlightHistory = async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = highlightHistoryQuerySchema.parse(req.query);

    const result = await HighlightLog.paginate(
        { userId: new mongoose.Types.ObjectId(req.user!.userId) },
        { page, limit, sort: { createdAt: -1 } },
    );

    reply.ok(res, result, "Highlight history fetched");
};

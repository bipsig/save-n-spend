import { Request, Response } from "express";
import Transaction from "../models/Transaction";
import User from "../models/User";
import { buildSnapshot } from "../services/highlightSnapshotService";
import { runHighlightRules } from "../services/highlightRules";
import { normalizeZone, startOfDayInZone } from "../utils/timezone";
import * as reply from "../utils/response";

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

    const [first, expenseCount] = await Promise.all([
        Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean(),
        Transaction.countDocuments({ userId, type: "expense" }),
    ]);

    const historyDays = first
        ? Math.round((startOfDayInZone(now, zone).getTime() - startOfDayInZone(first.occurredAt, zone).getTime()) / MS_PER_DAY)
        : 0;

    // The gate comes before the snapshot, so a warming account pays two cheap
    // queries instead of the whole assembly.
    if (!first || historyDays < MIN_HISTORY_DAYS || expenseCount < MIN_EXPENSES) {
        reply.ok(res, {
            highlights: [],
            generatedAt: now.toISOString(),
            timeZone: zone,
            warmingUp: WARMING_UP,
        }, "Highlights fetched");
        return;
    }

    const snapshot = await buildSnapshot(userId, zone, currency, now, first.occurredAt);
    const highlights = runHighlightRules(snapshot);

    reply.ok(res, {
        highlights,
        generatedAt: now.toISOString(),
        timeZone: zone,
    }, "Highlights fetched");
};

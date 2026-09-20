import { Request, Response } from "express"
import { dashboardSummaryQuerySchema } from "../schemas/dashboardSchema"
import Transaction from "../models/Transaction";
import * as reply from "../utils/response";
import Account from "../models/Account";
import mongoose from "mongoose";
import { monthRange } from "../utils/monthRange";
import { resolveZone } from "../utils/userZone";
import { healthScore } from "../services/healthService";
import { computeCurrentStreak } from "../services/highlightSnapshotService";

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {

  const { month } = dashboardSummaryQuerySchema.parse(req.query);
  const zone = await resolveZone(req);
  const now = new Date();

  // Shared with GET /budgets rather than cut here: the dashboard's "this month" and a
  // budget's month are the same month by definition, and two implementations drift.
  const { start, next, label } = monthRange(zone, month);

  // Sourced directly rather than through GET /highlights: that endpoint only surfaces
  // the streak when it clears the materiality-ranked, max-4 cap, so a real streak could
  // go silently missing on a busy day — wrong for a badge meant to always be visible.
  const currentStreak = await computeCurrentStreak(req.user!.userId, zone, now);

  const monthlySums = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.user!.userId),
        type: { $in: ["income", "expense"] },
        occurredAt: { $gte: start, $lt: next }
      }
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" }
      }
    }
  ]);

  const netWorth = await Account.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.user!.userId),
        isArchived: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$balance" }
      }
    }
  ]);

  const income = monthlySums.find((res) => res._id === "income")?.total ?? 0;
  const expenses = monthlySums.find((res) => res._id === "expense")?.total ?? 0;

  const response = {
    month: label,
    income,
    expenses,
    savings: income - expenses,
    netWorth: netWorth[0]?.total ?? 0,
    currentStreak
  };

  reply.ok(res, response, "Dashboard Summary Fetched successfully!");
}

/**
 * The financial health score. Takes no parameters on purpose — unlike the summary it is
 * always "as of now", measured over a trailing window rather than a named month, so
 * there is nothing for a caller to choose. See services/healthService.
 */
export const getHealthScore = async (req: Request, res: Response): Promise<void> => {
  const score = await healthScore(req.user!.userId, await resolveZone(req));

  reply.ok(res, score, "Health score fetched successfully!");
}
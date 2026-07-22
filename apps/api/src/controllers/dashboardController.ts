import { Request, Response } from "express"
import { dashboardSummaryQuerySchema } from "../schemas/dashboardSchema"
import Transaction from "../models/Transaction";
import * as reply from "../utils/response";
import Account from "../models/Account";
import mongoose from "mongoose";

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {

  const { month } = dashboardSummaryQuerySchema.parse(req.query);

  let monthStart: Date;
  let nextMonthStart: Date;

  if (month) {
    const [year, monthIndex] = month.split("-").map(Number);

    monthStart = new Date(Date.UTC(year, monthIndex - 1, 1));
    nextMonthStart = new Date(Date.UTC(year, monthIndex, 1));
  }
  else {
    const now = new Date();

    monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth()));
    nextMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1));
  }

  const monthlySums = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.user!.userId),
        type: { $in: ["income", "expense"] },
        occurredAt: { $gte: monthStart, $lt: nextMonthStart }
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
    month: `${monthStart.getUTCFullYear()}-${monthStart.getUTCMonth()< 9 ? "0" : ""}${monthStart.getUTCMonth()+1}`,
    income,
    expenses,
    savings: income - expenses,
    netWorth: netWorth[0]?.total ?? 0
  };

  reply.ok(res, response, "Dashboard Summary Fetched successfully!");
}
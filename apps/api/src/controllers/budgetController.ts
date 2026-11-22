import { Request, Response } from "express";
import Budget from "../models/Budget";
import type { Valid } from "../middleware/validate";
import { requireCategory } from "../services/ownership";
import { createBudgetSchemas, updateBudgetSchemas, listBudgetsSchemas, budgetIdSchemas } from "../schemas/budgetSchema";
import { budgetProgress } from "../services/budgetService";
import { resolveZone } from "../utils/userZone";
import { AppError } from "../utils/AppError";
import { inTransaction } from "../utils/inTransaction";
import { notFound } from "../utils/messages";
import { toDTO } from "../utils/dto";
import * as reply from "../utils/response";
import { changedSince, ifMatch, unchangedFilter } from "../utils/precondition";

export const listBudgets = async (req: Request, res: Response): Promise<void> => {
    const { query: { month } } = req.valid as Valid<typeof listBudgetsSchemas>;

    // The spend rollup lives in services/budgetService: the alert that fires when a
    // transaction crosses a limit has to arrive at the same figure this screen shows.
    const { items } = await budgetProgress(req.user!.userId, await resolveZone(req), month);

    reply.ok(res, items.map(({ budget, spent }) => ({ budget: toDTO(budget), spent })), "Budgets fetched");
}

export const createBudget = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createBudgetSchemas>;

    await requireCategory(req.user!.userId, body.category, { kind: "expense", live: true });

    try {
        // In a transaction so a sent Idempotency-Key is recorded with the budget (utils/inTransaction).
        const [savedBudget] = await inTransaction((session) => Budget.create([{
            userId: req.user?.userId,
            category: body.category,
            month: body.month,
            limit: body.limit
        }], { session }));
        reply.created(res, toDTO(savedBudget), "Budget created");
    }
    catch (err) {
        // The unique {userId, category, month} index is the check, so two at once can't both land.
        if ((err as { code?: number }).code === 11000) throw AppError.duplicate("a budget for this category this month");
        throw err;
    }
}

export const updateBudget = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof updateBudgetSchemas>;
    const since = ifMatch(req);
    const mine = { _id: id, userId: req.user?.userId };

    const budget = await Budget.findOneAndUpdate({ ...mine, ...unchangedFilter(since) }, { limit: body.limit }, { new: true });

    if (!budget) {
        if (since && await Budget.exists(mine)) throw changedSince();
        throw AppError.notFound(notFound("budget"));
    }

    reply.ok(res, toDTO(budget), "Budget updated");
}

export const deleteBudget = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof budgetIdSchemas>;

    const budget = await Budget.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!budget) {
        throw AppError.notFound(notFound("budget"));
    }

    reply.ok(res, null, "Budget deleted");
}

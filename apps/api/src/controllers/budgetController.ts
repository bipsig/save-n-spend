import { Request, Response } from "express";
import Budget from "../models/Budget";
import Category from "../models/Category";
import { createBudgetSchema, updateBudgetSchema, listBudgetQuerySchema } from "../schemas/budgetSchema";
import { budgetProgress } from "../services/budgetService";
import { resolveZone } from "../utils/userZone";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";

export const listBudgets = async (req: Request, res: Response): Promise<void> => {
    const { month } = listBudgetQuerySchema.parse(req.query);

    // The spend rollup lives in services/budgetService: the alert that fires when a
    // transaction crosses a limit has to arrive at the same figure this screen shows.
    const { items } = await budgetProgress(req.user!.userId, await resolveZone(req), month);

    reply.ok(res, items, "Budgets fetched successfully");
}

export const createBudget = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createBudgetSchema.parse(req.body);

    const category = await Category.findOne({
        _id: reqBody.category,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.badRequest("Category not found");
    }

    const savedBudget = await Budget.create({
        userId: req.user?.userId,
        category: reqBody.category,
        month: reqBody.month,
        limit: reqBody.limit
    });

    reply.created(res, savedBudget, "Budget created successfully");
}

export const updateBudget = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const reqBody = updateBudgetSchema.parse(req.body);

    const budget = await Budget.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        { limit: reqBody.limit },
        { new: true }
    );

    if (!budget) {
        throw AppError.notFound("Budget not found");
    }

    reply.ok(res, budget, "Budget updated successfully");
}

export const deleteBudget = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const budget = await Budget.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!budget) {
        throw AppError.notFound("Budget not found");
    }

    reply.ok(res, null, "Budget deleted successfully");
}

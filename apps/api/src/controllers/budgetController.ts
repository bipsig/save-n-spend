import { Request, Response } from "express";
import mongoose from "mongoose";
import Budget from "../models/Budget";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import { createBudgetSchema, updateBudgetSchema, listBudgetQuerySchema } from "../schemas/budgetSchema";
import { monthRange } from "../utils/monthRange";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";

export const listBudgets = async (req: Request, res: Response): Promise<void> => {
    const { month } = listBudgetQuerySchema.parse(req.query);
    const { start, next, label } = monthRange(month);

    const budgets = await Budget.find({
        userId: req.user?.userId,
        month: label
    });

    const spentByCategory = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user?.userId),
                type: "expense",
                occurredAt: { $gte: start, $lt: next }
            }
        },
        { $group: { _id: "$category", total: { $sum: "$amount" } } }
    ]);

    const spentMap = new Map<string, number>(
        spentByCategory.map((row) => [String(row._id), row.total])
    );

    const categories = await Category.find({ userId: req.user?.userId }, { parent: 1 });

    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
        if (category.parent) {
            const parentId = String(category.parent);
            const children = childrenByParent.get(parentId) ?? [];
            children.push(String(category._id));
            childrenByParent.set(parentId, children);
        }
    }

    const summary = budgets.map((budget) => {
        const categoryId = String(budget.category);
        const childIds = childrenByParent.get(categoryId) ?? [];
        const spent = (spentMap.get(categoryId) ?? 0)
            + childIds.reduce((sum, childId) => sum + (spentMap.get(childId) ?? 0), 0);

        return { budget, spent };
    });

    reply.ok(res, summary, "Budgets fetched successfully");
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

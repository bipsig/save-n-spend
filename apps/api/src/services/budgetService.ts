import mongoose from "mongoose";
import Budget, { type IBudget } from "../models/Budget";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import { monthRange } from "../utils/monthRange";

// "What has been spent against each budget this month" — asked by the budgets screen,
// by the alert that fires when a transaction crosses a limit, and by the weekly digest.
// It lives here rather than in the controller because three callers computing it three
// ways is three chances for the number in a notification to disagree with the number on
// the screen the notification opens.

export type BudgetProgress = {
    budget: IBudget;
    /** Paise spent in this budget's category, its children rolled in. */
    spent: number;
};

/**
 * Every budget for one zone-local month, with its spend.
 *
 * Children roll into their parent because that is how the app presents categories: a
 * limit on "Food" is understood to cover "Groceries" and "Dining out" beneath it. A
 * budget set directly on a child is still counted on its own — the rollup adds the
 * children's spend to the parent's, it doesn't move it.
 */
export const budgetProgress = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    month?: string,
): Promise<{ label: string; items: BudgetProgress[] }> => {
    const { start, next, label } = monthRange(zone, month);

    const budgets = await Budget.find({ userId, month: label });

    // Most users have no budgets, and the alert path runs on every expense — so the
    // aggregation and the category scan are worth skipping outright.
    if (budgets.length === 0) {
        return { label, items: [] };
    }

    const spentByCategory = await Transaction.aggregate([
        {
            $match: {
                // The aggregation pipeline does no casting of its own, unlike `find`.
                userId: new mongoose.Types.ObjectId(String(userId)),
                type: "expense",
                occurredAt: { $gte: start, $lt: next }
            }
        },
        { $group: { _id: "$category", total: { $sum: "$amount" } } }
    ]);

    const spentMap = new Map<string, number>(
        spentByCategory.map((row) => [String(row._id), row.total])
    );

    const categories = await Category.find({ userId }, { parent: 1 });

    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
        if (category.parent) {
            const parentId = String(category.parent);
            const children = childrenByParent.get(parentId) ?? [];
            children.push(String(category._id));
            childrenByParent.set(parentId, children);
        }
    }

    const items = budgets.map((budget) => {
        const categoryId = String(budget.category);
        const childIds = childrenByParent.get(categoryId) ?? [];
        const spent = (spentMap.get(categoryId) ?? 0)
            + childIds.reduce((sum, childId) => sum + (spentMap.get(childId) ?? 0), 0);

        return { budget, spent };
    });

    return { label, items };
}

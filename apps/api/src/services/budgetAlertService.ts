import mongoose from "mongoose";
import Category from "../models/Category";
import User from "../models/User";
import { budgetProgress } from "./budgetService";
import { notify, wantsNotification, type NotifiableUser } from "./notificationService";
import { formatAmount } from "../utils/money";
import { monthLabelInZone, normalizeZone } from "../utils/timezone";

// Event-driven, not scheduled: the moment worth telling someone about is the one where the
// expense they just entered took them over. Run after the transaction has committed, so an
// alert can never fail a saved expense, nor fire for one that rolled back.

const WARN_RATIO = 0.8;

/**
 * Notifies if the expense just written pushed its budget past 80% or past the limit. Two
 * dedupe keys per budget-month, so crossing 80% mid-month and the limit a week later is two
 * notifications — and each is sent exactly once however many more expenses land.
 */
export const checkBudgetAlerts = async (
    userId: string | mongoose.Types.ObjectId,
    categoryId: string | mongoose.Types.ObjectId | null | undefined,
    occurredAt: Date,
): Promise<void> => {
    try {
        // Transfers and adjustments have no category, so nothing governs them.
        if (!categoryId) return;

        const user = await User.findById(userId)
            .select("currency pushToken prefs.timeZone prefs.notifications")
            .lean();
        if (!user) return;

        // Before the aggregation, not after: alerts off shouldn't cost a query per expense.
        if (!wantsNotification(user.prefs?.notifications, "budgetWarning")) return;

        const zone = normalizeZone(user.prefs?.timeZone);

        // The month the SPEND belongs to — a receipt typed up on the 2nd still counts
        // against September.
        const month = monthLabelInZone(occurredAt, zone);

        const { items } = await budgetProgress(userId, zone, month);
        if (items.length === 0) return;

        const category = await Category.findOne({ _id: categoryId, userId })
            .select("name parent")
            .lean();

        // A limit on the parent governs its children too — the same rollup the budgets
        // screen shows.
        const governing = [String(categoryId), category?.parent ? String(category.parent) : ""];
        const match = items.find((item) => governing.includes(String(item.budget.category)));

        // A zero limit would divide to Infinity, and means "no cap" to nobody.
        if (!match || match.budget.limit <= 0) return;

        const { budget, spent } = match;
        const ratio = spent / budget.limit;
        if (ratio < WARN_RATIO) return;

        const exceeded = ratio >= 1;

        // Named after the category holding the LIMIT: "Groceries is over budget" when the
        // limit is on Food sends them looking for a budget that doesn't exist.
        const name = String(budget.category) === String(categoryId)
            ? category?.name
            : (await Category.findById(budget.category).select("name").lean())?.name;
        const label = name ?? "Budget";

        const limitText = formatAmount(budget.limit, user.currency);

        // With the limit on the parent, the expense that tripped it was filed under
        // another name — so say which sub-category fed it.
        const rollUp = String(budget.category) !== String(categoryId) && category?.name
            ? ` Includes ${category.name}.`
            : "";

        await notify(user as NotifiableUser, {
            type: exceeded ? "budgetExceeded" : "budgetWarning",
            title: exceeded
                ? `${label} is over budget`
                : `${label} is at ${Math.floor(ratio * 100)}%`,
            body: exceeded
                ? `${formatAmount(spent, user.currency)} spent against a ${limitText} limit.${rollUp}`
                : `${formatAmount(budget.limit - spent, user.currency)} left of your ${limitText} limit.${rollUp}`,
            dedupeKey: `budget:${String(budget._id)}:${month}:${exceeded ? "over" : "warn"}`,
            link: { screen: "budget", id: String(budget._id) },
        });
    }
    catch (err) {
        // Same contract as notify itself — the transaction is already saved, and a missing
        // nudge is not worth a 500.
        console.error(`[alerts] budget check failed for user ${String(userId)}`, err);
    }
}

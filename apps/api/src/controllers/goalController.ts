import { Request, Response } from "express";
import Goal from "../models/Goal";
import GoalContributionLog from "../models/GoalContributionLog";
import type { Valid } from "../middleware/validate";
import { createGoalSchemas, updateGoalSchemas, goalIdSchemas, contributeGoalSchemas } from "../schemas/goalSchema";
import { checkGoalMilestone } from "../services/goalAlertService";
import { AppError } from "../utils/AppError";
import { inTransaction } from "../utils/inTransaction";
import { notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";
import * as reply from "../utils/response";

export const listGoals = async (req: Request, res: Response): Promise<void> => {
    const goals = await Goal.find({ userId: req.user?.userId }).sort({ createdAt: 1 });
    reply.ok(res, toDTOs(goals), "Goals fetched");
}

export const createGoal = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createGoalSchemas>;

    const goal = await Goal.create({
        userId: req.user?.userId,
        ...body
    });

    reply.created(res, toDTO(goal), "Goal created");
}

export const updateGoal = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof updateGoalSchemas>;

    const goal = await Goal.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        body,
        { new: true }
    );

    if (!goal) {
        throw AppError.notFound(notFound("goal"));
    }

    reply.ok(res, toDTO(goal), "Goal updated");
}

export const deleteGoal = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof goalIdSchemas>;

    const goal = await Goal.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!goal) {
        throw AppError.notFound(notFound("goal"));
    }

    reply.ok(res, null, "Goal deleted");
}

export const contributeGoal = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body: { amount } } = req.valid as Valid<typeof contributeGoalSchemas>;
    const userId = req.user!.userId;

    const { goal, savedBefore } = await inTransaction(async (session) => {
        // One atomic update, so parallel contributions add up instead of overwriting each
        // other. It returns the goal as it was: the milestone check and the log both need
        // what THIS contribution changed, not merely the total now.
        const before = await Goal.findOneAndUpdate(
            { _id: id, userId },
            [{ $set: { saved: { $min: ["$target", { $add: ["$saved", amount] }] } } }],
            { session, new: false },
        ).lean();

        if (!before) {
            throw AppError.notFound(notFound("goal"));
        }

        const saved = Math.min(before.target, before.saved + amount);

        // The only record of WHEN money went into a goal (Goal.saved is a running total).
        // Logged as the amount actually applied (clamped at target), in the same transaction,
        // so Review's "saved this period" always matches the goal. Never below zero: a target
        // lowered under what's saved clamps `saved` down to it, and that is not a contribution.
        await GoalContributionLog.create([{ userId, goalId: before._id, amount: Math.max(0, saved - before.saved) }], { session });

        const after = await Goal.findOne({ _id: id, userId }).session(session);
        return { goal: after!, savedBefore: before.saved };
    });

    // After the commit: a notification never decides whether money landed.
    await checkGoalMilestone(goal, savedBefore);

    reply.ok(res, toDTO(goal), "Contribution added");
}

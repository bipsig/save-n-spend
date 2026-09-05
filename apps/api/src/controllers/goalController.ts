import { Request, Response } from "express";
import Goal from "../models/Goal";
import { createGoalSchema, updateGoalSchema, contributeGoalSchema } from "../schemas/goalSchema";
import { checkGoalMilestone } from "../services/goalAlertService";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";

export const listGoals = async (req: Request, res: Response): Promise<void> => {
    const goals = await Goal.find({ userId: req.user?.userId }).sort({ createdAt: 1 });
    reply.ok(res, goals, "Goals fetched successfully");
}

export const createGoal = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createGoalSchema.parse(req.body);

    const goal = await Goal.create({
        userId: req.user?.userId,
        ...reqBody
    });

    reply.created(res, goal, "Goal created successfully");
}

export const updateGoal = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const reqBody = updateGoalSchema.parse(req.body);

    const goal = await Goal.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        reqBody,
        { new: true }
    );

    if (!goal) {
        throw AppError.notFound("Goal not found");
    }

    reply.ok(res, goal, "Goal updated successfully");
}

export const deleteGoal = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const goal = await Goal.findOneAndDelete({
        _id: id,
        userId: req.user?.userId
    });

    if (!goal) {
        throw AppError.notFound("Goal not found");
    }

    reply.ok(res, null, "Goal deleted successfully");
}

export const contributeGoal = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { amount } = contributeGoalSchema.parse(req.body);

    const goal = await Goal.findOne({
        _id: id,
        userId: req.user?.userId
    });

    if (!goal) {
        throw AppError.notFound("Goal not found");
    }

    // Captured before the write: the milestone check needs to know what was crossed by
    // THIS contribution, not merely what the total is now.
    const savedBefore = goal.saved;

    goal.saved = Math.min(goal.saved + amount, goal.target);
    await goal.save();

    await checkGoalMilestone(goal, savedBefore);

    reply.ok(res, goal, "Contribution added successfully");
}

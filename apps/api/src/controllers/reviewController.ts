import { Request, Response } from "express";
import { reviewQuerySchema } from "../schemas/reviewSchema";
import { buildReview } from "../services/reviewService";
import { resolveZone } from "../utils/userZone";
import User from "../models/User";
import * as reply from "../utils/response";

export const getReview = async (req: Request, res: Response): Promise<void> => {
    const { period, offset } = reviewQuerySchema.parse(req.query);
    const zone = await resolveZone(req);
    const user = await User.findById(req.user!.userId).select("currency").lean();

    const review = await buildReview(req.user!.userId, zone, user?.currency ?? "INR", period, offset, req);

    reply.ok(res, review, "Review fetched successfully");
};

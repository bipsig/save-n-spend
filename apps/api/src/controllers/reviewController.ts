import { Request, Response } from "express";
import type { Valid } from "../middleware/validate";
import { reviewSchemas } from "../schemas/reviewSchema";
import { buildReview } from "../services/reviewService";
import { resolveZone } from "../utils/userZone";
import User from "../models/User";
import * as reply from "../utils/response";

export const getReview = async (req: Request, res: Response): Promise<void> => {
    const { query: { period, offset } } = req.valid as Valid<typeof reviewSchemas>;
    const zone = await resolveZone(req);
    const user = await User.findById(req.user!.userId).select("currency").lean();

    const review = await buildReview(req.user!.userId, zone, user?.currency ?? "INR", period, offset, req);

    reply.ok(res, review, "Review fetched");
};

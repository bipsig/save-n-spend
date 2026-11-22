import { Request, Response } from "express";
import type { Valid } from "../middleware/validate";
import { reviewSchemas } from "../schemas/reviewSchema";
import { buildReview } from "../services/reviewService";
import { resolveZone } from "../utils/userZone";
import * as reply from "../utils/response";
import { tripRule } from "../services/tripEntries";

export const getReview = async (req: Request, res: Response): Promise<void> => {
    const { query: { period, offset, trips } } = req.valid as Valid<typeof reviewSchemas>;
    const zone = await resolveZone(req);
    const review = await buildReview(req.user!.userId, zone, period, offset, req, tripRule(trips, zone));

    reply.ok(res, review, "Review fetched");
};

import { Request, Response } from "express";
import mongoose from "mongoose";
import * as reply from "../utils/response";
import { AppError } from "../utils/AppError";
import { resolveZone } from "../utils/userZone";
import { getInvestments, getInvestmentHistory } from "../services/investmentService";

export const listInvestments = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    const payload = await getInvestments(req.user!.userId, zone);
    reply.ok(res, payload, "Investments fetched successfully");
};

export const investmentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        throw AppError.badRequest("Invalid investment id");
    }
    const txns = await getInvestmentHistory(req.user!.userId, id);
    reply.ok(res, txns, "Investment history fetched");
};

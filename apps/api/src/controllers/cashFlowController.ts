import { Request, Response } from "express";
import * as reply from "../utils/response";
import { resolveZone } from "../utils/userZone";
import { getCashFlow } from "../services/cashFlowService";

export const cashFlow = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    const payload = await getCashFlow(req.user!.userId, zone);
    reply.ok(res, payload, "Cash flow fetched");
};

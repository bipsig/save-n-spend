import { Request, Response } from "express";
import mongoose from "mongoose";
import * as reply from "../utils/response";
import User from "../models/User";
import { restoreRequestSchema } from "../schemas/backupSchema";
import { exportAccountData, restoreAccountData } from "../services/backupService";

export const getBackup = async (req: Request, res: Response): Promise<void> => {
    const backup = await exportAccountData(req.user!.userId);
    reply.ok(res, backup, "Backup exported");
};

export const restoreBackup = async (req: Request, res: Response): Promise<void> => {
    const payload = restoreRequestSchema.parse(req.body);

    let counts: Record<string, number> = {};
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            counts = await restoreAccountData(req.user!.userId, payload, session);
        });
    }
    finally {
        session.endSession();
    }

    // Read fresh, after commit, with no session: the restore may have changed
    // currency/timeZone/notifications/defaultAccount, and the client's own session
    // store has to pick up the new copy — appZone() reads prefs.timeZone straight off
    // it, so a stale one would keep bucketing dates in the zone this backup just left.
    const user = await User.findById(req.user!.userId);

    reply.ok(res, { counts, user }, "Backup restored");
};

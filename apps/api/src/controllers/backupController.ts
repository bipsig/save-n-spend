import { Request, Response } from "express";
import * as reply from "../utils/response";
import User from "../models/User";
import type { Valid } from "../middleware/validate";
import { restoreSchemas } from "../schemas/backupSchema";
import { exportAccountData, restoreAccountData } from "../services/backupService";
import { inTransaction } from "../utils/inTransaction";
import { toDTO } from "../utils/dto";

export const getBackup = async (req: Request, res: Response): Promise<void> => {
    const backup = await exportAccountData(req.user!.userId);
    reply.ok(res, backup, "Backup exported");
};

export const restoreBackup = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof restoreSchemas>;
    const { confirm: _confirm, ...payload } = body;

    const counts = await inTransaction((session) => restoreAccountData(req.user!.userId, payload, session));

    // Read fresh, after commit, with no session: the restore may have changed
    // currency/timeZone/notifications/defaultAccount, and the client's own session
    // store has to pick up the new copy — appZone() reads prefs.timeZone straight off
    // it, so a stale one would keep bucketing dates in the zone this backup just left.
    const user = await User.findById(req.user!.userId);

    reply.ok(res, { counts, user: user && toDTO(user) }, "Backup restored");
};

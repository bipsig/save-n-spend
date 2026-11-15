import { Request, Response } from "express";
import * as reply from "../utils/response";
import { resolveZone } from "../utils/userZone";
import type { Valid } from "../middleware/validate";
import { dismissRecurringSchemas } from "../schemas/recurringSchema";
import { dismissRecurring, getRecurringSuggestions } from "../services/recurringService";

export const listRecurringSuggestions = async (req: Request, res: Response): Promise<void> => {
    const zone = await resolveZone(req);
    const payload = await getRecurringSuggestions(req.user!.userId, zone);
    reply.ok(res, payload, "Recurring suggestions fetched");
};

export const dismissRecurringSuggestion = async (req: Request, res: Response): Promise<void> => {
    const { body: { key } } = req.valid as Valid<typeof dismissRecurringSchemas>;
    await dismissRecurring(req.user!.userId, key);
    reply.ok(res, null, "Suggestion dismissed");
};

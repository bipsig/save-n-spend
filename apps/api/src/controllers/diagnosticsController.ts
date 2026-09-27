import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import RequestLog from "../models/RequestLog";
import { clientErrorSchema } from "../schemas/diagnosticsSchema";
import { isRequestId } from "../utils/requestId";
import { log } from "../utils/logger";
import * as reply from "../utils/response";

/** The signed-in user if the request carries a valid token, else null. An error report can
 *  come from the login screen, so it can't require one — but when there is one, the report
 *  should be attributed to its account. */
const optionalUserId = (req: Request): string | null => {
    const token = req.header("authorization")?.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) return null;
    try {
        return (jwt.verify(token, secret) as { userId?: string }).userId ?? null;
    }
    catch {
        return null;
    }
};

export const reportClientError = async (req: Request, res: Response): Promise<void> => {
    const body = clientErrorSchema.parse(req.body);
    log({
        source: "app",
        route: body.screen ?? "unknown screen",
        requestId: isRequestId(body.requestId) ? body.requestId : (res.locals.requestId as string),
        userId: optionalUserId(req),
        message: body.message,
        stack: body.stack ?? null,
        appVersion: body.appVersion ?? req.header("x-app-version") ?? null,
    });
    reply.ok(res, { requestId: res.locals.requestId }, "Reported");
};

/** The caller's own last 50 log rows, newest first — never anyone else's. */
export const recentRequests = async (req: Request, res: Response): Promise<void> => {
    const rows = await RequestLog.find({ userId: req.user!.userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("-_id -userId")
        .lean();
    reply.ok(res, rows, "Recent requests");
};

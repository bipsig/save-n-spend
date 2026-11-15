import type { Request, Response, NextFunction } from "express";
import { sendError } from "./errorHandler";
import { MESSAGES } from "../utils/messages";

/**
 * A request that carries a body must send it as JSON. Without this, a body sent with no
 * Content-Type (or as text) reaches the handler as "no body" and is answered as if fields were
 * missing. The apps always send `Content-Type: application/json`. An empty body is fine with
 * any type: body-less actions like reopen or read-all stay as they are.
 */
export const requireJsonBody = (req: Request, res: Response, next: NextFunction): void => {
    const length = Number(req.headers["content-length"] ?? 0);
    const hasBody = req.headers["transfer-encoding"] !== undefined || length > 0;
    if (hasBody && !req.is("application/json")) {
        sendError(res, { status: 400, code: "invalid_json", message: MESSAGES.invalidJson, logMessage: `body sent as ${req.headers["content-type"] ?? "no content type"}` });
        return;
    }
    next();
};

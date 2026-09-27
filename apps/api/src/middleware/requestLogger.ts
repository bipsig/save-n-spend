import { Request, Response, NextFunction } from "express";
import { isRequestId, makeRequestId } from "../utils/requestId";
import { log } from "../utils/logger";

// Gives every request a reference and logs it once it's answered.
//
// The reference comes from the phone's `X-Request-Id` when it sends a well-formed one, so the
// id in the app's error message is the same one in the log; otherwise the server makes one.
// It goes back in the `X-Request-Id` response header either way, and in every error body
// (see errorHandler).
//
// Logged: method, route pattern (`/api/v1/bills/:id`, never the ids), status, time taken,
// who, and the error message if it failed. Not the body, not the query — both can carry money.

/** Hit every few minutes by the uptime pinger and the app's wake poll — noise, not activity. */
const SKIP = new Set(["/health"]);

/** `/api/v1/investments/6a76…c688/basis?mode=keep` → `/api/v1/investments/:id/basis`. */
export const routePattern = (url: string): string =>
    (url.split("?")[0]
        .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, "/:id")
        .replace(/\/+$/, "")) || "/";

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header("x-request-id");
    const requestId = isRequestId(incoming) ? incoming : makeRequestId();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    if (SKIP.has(req.path)) return next();

    const started = process.hrtime.bigint();
    res.on("finish", () => {
        // From the original URL, not req.baseUrl + req.route: Express unwinds baseUrl as an error
        // leaves each router, so a failed request would log as "/:id/basis". Ids become ":id"
        // so one route reads as one route, and the query is dropped (it can carry filters).
        const route = routePattern(req.originalUrl);
        log({
            source: "api",
            route: `${req.method} ${route}`,
            requestId,
            userId: req.user?.userId ?? null,
            status: res.statusCode,
            durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
            message: (res.locals.errorMessage as string | undefined) ?? null,
            stack: (res.locals.errorStack as string | undefined) ?? null,
            appVersion: req.header("x-app-version") ?? null,
        });
    });
    next();
};

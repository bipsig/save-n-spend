import rateLimit, { type Options } from "express-rate-limit";
import { sendError } from "./errorHandler";
import { MESSAGES } from "../utils/messages";

/**
 * The 429 every limiter sends: the standard error shape with `requestId`, code `rate_limited`
 * and a Retry-After header (seconds until the window resets). Pass it as a limiter's `handler`.
 */
export const rateLimitHandler = (message: string): Options["handler"] => (req, res, _next, options) => {
    const reset = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const seconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : Math.ceil(options.windowMs / 1000);
    // express-rate-limit has usually set it already; this keeps it when it hasn't.
    const headers: Record<string, string> = res.getHeader("Retry-After") ? {} : { "Retry-After": String(seconds) };
    sendError(res, { status: 429, code: "rate_limited", message, headers });
};

// Brute-force guard on the credential endpoints (login/register). 10 attempts per IP per 15 minutes.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(MESSAGES.rateLimitedAuth),
});

// Guards the one endpoint that can wipe an account's own data. A real restore is a rare,
// deliberate act, so this is tighter than login's — 5 per IP per hour.
export const restoreLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(MESSAGES.rateLimitedRestore),
});

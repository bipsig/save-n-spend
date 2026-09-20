import rateLimit from "express-rate-limit";

// Brute-force guard on the credential endpoints (login/register). 10 attempts
// per IP per 15 minutes. The message follows the app envelope so the mobile
// fetch helper surfaces it via `json.message`.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many attempts. Please try again in a few minutes.",
    data: null,
  },
});

// Guards the one endpoint that can wipe an account's own data. A real restore is a rare,
// deliberate act, so this is tighter than login's — 5 per IP per hour.
export const restoreLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many attempts. Please try again in a few minutes.",
    data: null,
  },
});

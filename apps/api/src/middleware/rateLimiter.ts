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

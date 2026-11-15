import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../../middleware/authMiddleware";
import { rateLimitHandler } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import { recentRequests, reportClientError } from "../../controllers/diagnosticsController";
import { clientErrorSchemas } from "../../schemas/diagnosticsSchema";
import { MESSAGES } from "../../utils/messages";

// Open without a token (a crash can happen on the login screen), so it's capped per IP —
// a crash loop on one phone shouldn't flood the log.
const clientErrorLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler(MESSAGES.rateLimitedReports),
});

const router = Router();

router.post("/client-errors", clientErrorLimiter, validate(clientErrorSchemas), reportClientError);
router.get("/requests", protect, recentRequests);

export default router;

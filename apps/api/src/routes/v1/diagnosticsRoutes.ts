import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../../middleware/authMiddleware";
import { recentRequests, reportClientError } from "../../controllers/diagnosticsController";

// Open without a token (a crash can happen on the login screen), so it's capped per IP —
// a crash loop on one phone shouldn't flood the log.
const clientErrorLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, statusCode: 429, message: "Too many reports", data: null },
});

const router = Router();

router.post("/client-errors", clientErrorLimiter, reportClientError);
router.get("/requests", protect, recentRequests);

export default router;

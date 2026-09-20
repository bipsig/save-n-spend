import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getDashboardSummary, getHealthScore, getDashboardInsights } from "../../controllers/dashboardController";

const router = Router();

router.get("/summary", protect, getDashboardSummary);
router.get("/health", protect, getHealthScore);
router.get("/insights", protect, getDashboardInsights);

export default router;
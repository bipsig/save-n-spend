import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { getDashboardSummary, getHealthScore, getDashboardInsights } from "../../controllers/dashboardController";
import { dashboardSummarySchemas } from "../../schemas/dashboardSchema";

const router = Router();

router.get("/summary", protect, validate(dashboardSummarySchemas), getDashboardSummary);
router.get("/health", protect, getHealthScore);
router.get("/insights", protect, getDashboardInsights);

export default router;

import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getDashboardSummary, getHealthScore } from "../../controllers/dashboardController";

const router = Router();

router.get("/summary", protect, getDashboardSummary);
router.get("/health", protect, getHealthScore);

export default router;
import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getDashboardSummary } from "../../controllers/dashboardController";

const router = Router();

router.get("/summary", protect, getDashboardSummary);

export default router;
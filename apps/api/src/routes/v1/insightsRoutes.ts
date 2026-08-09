import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getInsights } from "../../controllers/insightsController";

const router = Router();

router.get("/", protect, getInsights);

export default router;

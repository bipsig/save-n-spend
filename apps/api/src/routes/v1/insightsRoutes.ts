import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getCategoryInsights, getInsights } from "../../controllers/insightsController";

const router = Router();

router.get("/", protect, getInsights);
router.get("/category/:id", protect, getCategoryInsights);

export default router;

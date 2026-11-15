import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { getCategoryInsights, getInsights } from "../../controllers/insightsController";
import { categoryInsightsSchemas, insightsSchemas } from "../../schemas/insightsSchema";

const router = Router();

router.get("/", protect, validate(insightsSchemas), getInsights);
router.get("/category/:id", protect, validate(categoryInsightsSchemas), getCategoryInsights);

export default router;

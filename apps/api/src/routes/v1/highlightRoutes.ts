import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { getHighlights, getHighlightHistory } from "../../controllers/highlightController";
import { highlightHistorySchemas, highlightsSchemas } from "../../schemas/highlightSchema";

const router = Router();

router.get("/", protect, validate(highlightsSchemas), getHighlights);
router.get("/history", protect, validate(highlightHistorySchemas), getHighlightHistory);

export default router;

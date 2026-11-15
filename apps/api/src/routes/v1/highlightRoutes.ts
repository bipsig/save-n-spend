import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { getHighlights, getHighlightHistory } from "../../controllers/highlightController";
import { highlightHistorySchemas } from "../../schemas/highlightSchema";

const router = Router();

router.get("/", protect, getHighlights);
router.get("/history", protect, validate(highlightHistorySchemas), getHighlightHistory);

export default router;

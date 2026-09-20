import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getHighlights, getHighlightHistory } from "../../controllers/highlightController";

const router = Router();

router.get("/", protect, getHighlights);
router.get("/history", protect, getHighlightHistory);

export default router;

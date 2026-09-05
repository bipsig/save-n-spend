import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getHighlights } from "../../controllers/highlightController";

const router = Router();

router.get("/", protect, getHighlights);

export default router;

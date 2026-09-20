import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { getReview } from "../../controllers/reviewController";

const router = Router();

router.get("/", protect, getReview);

export default router;

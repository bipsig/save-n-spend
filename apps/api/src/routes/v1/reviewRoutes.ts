import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { getReview } from "../../controllers/reviewController";
import { reviewSchemas } from "../../schemas/reviewSchema";

const router = Router();

router.get("/", protect, validate(reviewSchemas), getReview);

export default router;

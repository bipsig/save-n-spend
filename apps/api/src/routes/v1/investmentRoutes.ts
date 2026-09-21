import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { listInvestments, investmentHistory } from "../../controllers/investmentController";

const router = Router();

router.get("/", protect, listInvestments);
router.get("/:id/history", protect, investmentHistory);

export default router;

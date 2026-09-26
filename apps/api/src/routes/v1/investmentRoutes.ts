import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { listInvestments, investmentHistory, updateInvestmentBasis } from "../../controllers/investmentController";

const router = Router();

router.get("/", protect, listInvestments);
router.get("/:id/history", protect, investmentHistory);
router.patch("/:id/basis", protect, updateInvestmentBasis);

export default router;

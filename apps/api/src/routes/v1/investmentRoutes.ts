import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { deleteInvestment, listInvestments, investmentHistory, investmentTrend, updateInvestmentBasis } from "../../controllers/investmentController";

const router = Router();

router.get("/", protect, listInvestments);
router.get("/trend", protect, investmentTrend);
router.get("/:id/history", protect, investmentHistory);
router.patch("/:id/basis", protect, updateInvestmentBasis);
router.delete("/:id", protect, deleteInvestment);

export default router;

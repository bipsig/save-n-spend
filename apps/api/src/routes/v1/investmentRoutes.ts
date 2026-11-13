import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { deleteInvestment, listInvestments, investmentHistory, investmentTrend, investmentReport, updateInvestmentBasis } from "../../controllers/investmentController";

const router = Router();

router.get("/", protect, listInvestments);
router.get("/trend", protect, investmentTrend);
router.get("/report", protect, investmentReport);
router.get("/:id/history", protect, investmentHistory);
router.patch("/:id/basis", protect, updateInvestmentBasis);
router.delete("/:id", protect, deleteInvestment);

export default router;

import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { deleteInvestment, listInvestments, investmentHistory, investmentTrend, investmentReport, updateInvestmentBasis } from "../../controllers/investmentController";
import { deleteInvestmentRequest, holdingIdRequest, investmentBasisRequest } from "../../schemas/accountSchema";

const router = Router();

router.get("/", protect, listInvestments);
router.get("/trend", protect, investmentTrend);
router.get("/report", protect, investmentReport);
router.get("/:id/history", protect, validate(holdingIdRequest), investmentHistory);
router.patch("/:id/basis", protect, validate(investmentBasisRequest), updateInvestmentBasis);
router.delete("/:id", protect, validate(deleteInvestmentRequest), deleteInvestment);

export default router;

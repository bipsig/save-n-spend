import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { cashFlow } from "../../controllers/cashFlowController";

const router = Router();

router.get("/", protect, cashFlow);

export default router;

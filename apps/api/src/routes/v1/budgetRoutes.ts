import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { createBudget, deleteBudget, listBudgets, updateBudget } from "../../controllers/budgetController";

const router = Router();

router.get("/", protect, listBudgets);
router.post("/", protect, createBudget);
router.patch("/:id", protect, updateBudget);
router.delete("/:id", protect, deleteBudget);

export default router;

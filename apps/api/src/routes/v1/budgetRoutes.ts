import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { withIdempotency } from "../../middleware/idempotency";
import { createBudget, deleteBudget, listBudgets, updateBudget } from "../../controllers/budgetController";
import { budgetIdSchemas, createBudgetSchemas, listBudgetsSchemas, updateBudgetSchemas } from "../../schemas/budgetSchema";

const router = Router();

router.get("/", protect, validate(listBudgetsSchemas), listBudgets);
router.post("/", protect, validate(createBudgetSchemas), withIdempotency(), createBudget);
router.patch("/:id", protect, validate(updateBudgetSchemas), updateBudget);
router.delete("/:id", protect, validate(budgetIdSchemas), deleteBudget);

export default router;

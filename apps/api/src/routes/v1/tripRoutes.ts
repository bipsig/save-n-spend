import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import * as trips from "../../controllers/tripController";
import {
    addExpenseSchemas, closeTripSchemas, createTripSchemas, editExpenseSchemas, expenseIdSchemas, importCommitSchemas,
    importPreviewSchemas, planSchemas, reopenTripSchemas, settleSchemas, tripIdSchemas, updateTripSchemas,
} from "../../schemas/tripSchema";

const router = Router();

router.get("/", protect, trips.list);
router.post("/", protect, validate(createTripSchemas), trips.create);
router.get("/:id", protect, validate(tripIdSchemas), trips.detail);
router.patch("/:id", protect, validate(updateTripSchemas), trips.update);
router.delete("/:id", protect, validate(tripIdSchemas), trips.remove);
router.post("/:id/expenses", protect, validate(addExpenseSchemas), trips.addExpense);
router.patch("/:id/expenses/:expenseId", protect, validate(editExpenseSchemas), trips.editExpense);
router.delete("/:id/expenses/:expenseId", protect, validate(expenseIdSchemas), trips.removeExpense);
router.post("/:id/settle", protect, validate(settleSchemas), trips.settle);
router.put("/:id/plan", protect, validate(planSchemas), trips.putPlan);
router.delete("/:id/plan", protect, validate(tripIdSchemas), trips.removePlan);
router.post("/:id/close", protect, validate(closeTripSchemas), trips.close);
router.post("/:id/reopen", protect, validate(reopenTripSchemas), trips.reopen);
router.post("/:id/import/preview", protect, validate(importPreviewSchemas), trips.importPreview);
router.post("/:id/import/commit", protect, validate(importCommitSchemas), trips.importCommit);

export default router;

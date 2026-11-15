import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { withIdempotency } from "../../middleware/idempotency";
import * as trips from "../../controllers/tripController";
import {
    addExpenseSchemas, closeTripSchemas, createTripSchemas, editExpenseSchemas, expenseIdSchemas, importCommitSchemas,
    importPreviewSchemas, planSchemas, reopenTripSchemas, settleSchemas, tripIdSchemas, updateTripSchemas,
} from "../../schemas/tripSchema";

const router = Router();

router.get("/", protect, trips.list);
router.post("/", protect, validate(createTripSchemas), withIdempotency(), trips.create);
router.get("/:id", protect, validate(tripIdSchemas), trips.detail);
router.patch("/:id", protect, validate(updateTripSchemas), trips.update);
router.delete("/:id", protect, validate(tripIdSchemas), withIdempotency({ money: true }), trips.remove);
router.post("/:id/expenses", protect, validate(addExpenseSchemas), withIdempotency({ money: true }), trips.addExpense);
router.patch("/:id/expenses/:expenseId", protect, validate(editExpenseSchemas), withIdempotency({ money: true }), trips.editExpense);
router.delete("/:id/expenses/:expenseId", protect, validate(expenseIdSchemas), withIdempotency({ money: true }), trips.removeExpense);
router.post("/:id/settle", protect, validate(settleSchemas), withIdempotency({ money: true }), trips.settle);
router.put("/:id/plan", protect, validate(planSchemas), withIdempotency({ money: true }), trips.putPlan);
router.delete("/:id/plan", protect, validate(tripIdSchemas), withIdempotency({ money: true }), trips.removePlan);
router.post("/:id/close", protect, validate(closeTripSchemas), withIdempotency({ money: true }), trips.close);
router.post("/:id/reopen", protect, validate(reopenTripSchemas), trips.reopen);
router.post("/:id/import/preview", protect, validate(importPreviewSchemas), trips.importPreview);
router.post("/:id/import/commit", protect, validate(importCommitSchemas), withIdempotency({ money: true }), trips.importCommit);

export default router;

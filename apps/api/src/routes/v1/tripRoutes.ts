import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import * as trips from "../../controllers/tripController";

const router = Router();

router.get("/", protect, trips.list);
router.post("/", protect, trips.create);
router.get("/:id", protect, trips.detail);
router.patch("/:id", protect, trips.update);
router.delete("/:id", protect, trips.remove);
router.post("/:id/expenses", protect, trips.addExpense);
router.patch("/:id/expenses/:expenseId", protect, trips.editExpense);
router.delete("/:id/expenses/:expenseId", protect, trips.removeExpense);
router.post("/:id/settle", protect, trips.settle);
router.post("/:id/close", protect, trips.close);
router.post("/:id/reopen", protect, trips.reopen);
router.post("/:id/import/preview", protect, trips.importPreview);
router.post("/:id/import/commit", protect, trips.importCommit);

export default router;

import { Router } from "express";
import { convertToInvestment, createTransaction, deleteTransaction, filterTransactions, getTitleSuggestions, getTransaction, getTransactionSummary, updateTransaction } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";

const router = Router();

router.get("/", protect, filterTransactions);
router.post("/", protect, createTransaction);
router.get("/summary", protect, getTransactionSummary);
// Ahead of the /:id route below — Express would otherwise match this path as
// `id: "title-suggestions"` and 404 inside getTransaction instead.
router.get("/title-suggestions", protect, getTitleSuggestions);
router.get("/:id", protect, getTransaction);
router.patch("/:id", protect, updateTransaction);
router.post("/:id/convert-to-investment", protect, convertToInvestment);
router.delete("/:id", protect, deleteTransaction);

export default router;
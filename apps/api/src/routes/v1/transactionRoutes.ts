import { Router } from "express";
import { createTransaction, deleteTransaction, filterTransactions, getTransaction, getTransactionSummary, updateTransaction } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";

const router = Router();

router.get("/", protect, filterTransactions);
router.post("/", protect, createTransaction);
router.get("/summary", protect, getTransactionSummary);
router.get("/:id", protect, getTransaction);
router.patch("/:id", protect, updateTransaction);
router.delete("/:id", protect, deleteTransaction);

export default router;
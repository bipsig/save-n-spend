import { Router } from "express";
import { createTransaction, deleteTransaction, filterTransactions, updateTransaction } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";

const router = Router();

router.get("/", protect, filterTransactions);
router.post("/", protect, createTransaction);
router.patch("/:id", protect, updateTransaction);
router.delete("/:id", protect, deleteTransaction);

export default router;
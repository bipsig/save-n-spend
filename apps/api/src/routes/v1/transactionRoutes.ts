import { Router } from "express";
import { createTransaction, filterTransactions } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";

const router = Router();

router.get("/", protect, filterTransactions);
router.post("/", protect, createTransaction);

export default router;
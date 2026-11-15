import { Router } from "express";
import { bulkConvertToInvestment, convertToInvestment, createTransaction, deleteTransaction, filterTransactions, getTitleSuggestions, getTransaction, getTransactionSummary, updateTransaction } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { withIdempotency } from "../../middleware/idempotency";
import {
    bulkConvertToInvestmentRequest, convertToInvestmentRequest, createTransactionRequest, listTransactionsRequest,
    transactionIdRequest, transactionSummaryRequest, updateTransactionRequest,
} from "../../schemas/transactionSchema";

const router = Router();

router.get("/", protect, validate(listTransactionsRequest), filterTransactions);
router.post("/", protect, validate(createTransactionRequest), withIdempotency({ money: true }), createTransaction);
router.post("/convert-to-investment", protect, validate(bulkConvertToInvestmentRequest), withIdempotency({ money: true }), bulkConvertToInvestment);
router.get("/summary", protect, validate(transactionSummaryRequest), getTransactionSummary);
// Ahead of the /:id route below — Express would otherwise match this path as
// `id: "title-suggestions"` and 404 inside getTransaction instead.
router.get("/title-suggestions", protect, getTitleSuggestions);
router.get("/:id", protect, validate(transactionIdRequest), getTransaction);
router.patch("/:id", protect, validate(updateTransactionRequest), withIdempotency({ money: true }), updateTransaction);
router.post("/:id/convert-to-investment", protect, validate(convertToInvestmentRequest), withIdempotency({ money: true }), convertToInvestment);
router.delete("/:id", protect, validate(transactionIdRequest), withIdempotency({ money: true }), deleteTransaction);

export default router;

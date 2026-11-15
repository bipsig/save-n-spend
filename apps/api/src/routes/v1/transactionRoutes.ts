import { Router } from "express";
import { bulkConvertToInvestment, convertToInvestment, createTransaction, deleteTransaction, filterTransactions, getTitleSuggestions, getTransaction, getTransactionSummary, updateTransaction } from "../../controllers/transactionController";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import {
    bulkConvertToInvestmentRequest, convertToInvestmentRequest, createTransactionRequest, listTransactionsRequest,
    transactionIdRequest, transactionSummaryRequest, updateTransactionRequest,
} from "../../schemas/transactionSchema";

const router = Router();

router.get("/", protect, validate(listTransactionsRequest), filterTransactions);
router.post("/", protect, validate(createTransactionRequest), createTransaction);
router.post("/convert-to-investment", protect, validate(bulkConvertToInvestmentRequest), bulkConvertToInvestment);
router.get("/summary", protect, validate(transactionSummaryRequest), getTransactionSummary);
// Ahead of the /:id route below — Express would otherwise match this path as
// `id: "title-suggestions"` and 404 inside getTransaction instead.
router.get("/title-suggestions", protect, getTitleSuggestions);
router.get("/:id", protect, validate(transactionIdRequest), getTransaction);
router.patch("/:id", protect, validate(updateTransactionRequest), updateTransaction);
router.post("/:id/convert-to-investment", protect, validate(convertToInvestmentRequest), convertToInvestment);
router.delete("/:id", protect, validate(transactionIdRequest), deleteTransaction);

export default router;

import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { createBill, deleteBill, listBills, markBillPaid, skipBill, updateBill } from "../../controllers/billController";
import { billIdSchemas, createBillSchemas, listBillsSchemas, payBillSchemas, skipBillSchemas, updateBillSchemas } from "../../schemas/billSchema";

const router = Router();

router.get("/", protect, validate(listBillsSchemas), listBills);
router.post("/", protect, validate(createBillSchemas), createBill);
router.patch("/:id", protect, validate(updateBillSchemas), updateBill);
router.delete("/:id", protect, validate(billIdSchemas), deleteBill);
router.post("/:id/pay", protect, validate(payBillSchemas), markBillPaid);
router.post("/:id/skip", protect, validate(skipBillSchemas), skipBill);

export default router;

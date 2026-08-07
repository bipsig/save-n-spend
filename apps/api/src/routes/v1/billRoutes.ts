import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { createBill, deleteBill, listBills, markBillPaid, skipBill, updateBill } from "../../controllers/billController";

const router = Router();

router.get("/", protect, listBills);
router.post("/", protect, createBill);
router.patch("/:id", protect, updateBill);
router.delete("/:id", protect, deleteBill);
router.post("/:id/pay", protect, markBillPaid);
router.post("/:id/skip", protect, skipBill);

export default router;

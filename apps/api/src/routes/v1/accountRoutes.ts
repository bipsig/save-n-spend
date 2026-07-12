import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { archiveAccount, createAccount, getAccount, listAccounts, updateAccount } from "../../controllers/accountController";

const router = Router();

router.get('/', protect,  listAccounts);
router.post('/', protect, createAccount);
router.get ('/:id', protect, getAccount);
router.patch ('/:id', protect, updateAccount);
router.delete('/:id', protect, archiveAccount);

export default router;
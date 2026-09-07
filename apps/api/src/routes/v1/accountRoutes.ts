import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { archiveAccount, createAccount, getAccount, listAccounts, syncAccountBalance, updateAccount } from "../../controllers/accountController";

const router = Router();

router.get('/', protect,  listAccounts);
router.post('/', protect, createAccount);
router.get ('/:id', protect, getAccount);
router.patch ('/:id', protect, updateAccount);
// Its own path rather than a field on PATCH /:id, because this is the only account
// write that moves money and it must not be reachable by accident from a rename.
router.patch ('/:id/balance', protect, syncAccountBalance);
router.delete('/:id', protect, archiveAccount);

export default router;
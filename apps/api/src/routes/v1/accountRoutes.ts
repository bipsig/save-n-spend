import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { withIdempotency } from "../../middleware/idempotency";
import { archiveAccount, createAccount, getAccount, listAccounts, reorderAccounts, syncAccountBalance, updateAccount } from "../../controllers/accountController";
import { accountIdRequest, createAccountRequest, reorderAccountsRequest, syncAccountBalanceRequest, updateAccountRequest } from "../../schemas/accountSchema";

const router = Router();

router.get('/', protect, listAccounts);
router.post('/', protect, validate(createAccountRequest), withIdempotency({ money: true }), createAccount);
// Above PATCH /:id, which would otherwise match "reorder" as an id.
router.patch('/reorder', protect, validate(reorderAccountsRequest), reorderAccounts);
router.get('/:id', protect, validate(accountIdRequest), getAccount);
router.patch('/:id', protect, validate(updateAccountRequest), updateAccount);
// Its own path rather than a field on PATCH /:id, because this is the only account
// write that moves money and it must not be reachable by accident from a rename.
router.patch('/:id/balance', protect, validate(syncAccountBalanceRequest), withIdempotency({ money: true }), syncAccountBalance);
router.delete('/:id', protect, validate(accountIdRequest), archiveAccount);

export default router;

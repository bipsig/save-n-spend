import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { deleteMe, getMe, updateMe } from "../../controllers/userController";

const router = Router();

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.delete('/me', protect, deleteMe);

export default router;

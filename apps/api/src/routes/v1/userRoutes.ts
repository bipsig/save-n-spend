import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { updateMe } from "../../controllers/userController";

const router = Router();

router.patch('/me', protect, updateMe);

export default router;
import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { deleteMe, getMe, updateMe } from "../../controllers/userController";
import { updateMeSchemas } from "../../schemas/userSchema";

const router = Router();

router.get('/me', protect, getMe);
router.patch('/me', protect, validate(updateMeSchemas), updateMe);
router.delete('/me', protect, deleteMe);

export default router;

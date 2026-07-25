import { Router } from 'express';
import { login, me, register } from '../../controllers/authController';
import { protect } from '../../middleware/authMiddleware';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post ('/register', authLimiter, register);
router.post ('/login', authLimiter, login);
router.get ('/me', protect, me);

export default router;
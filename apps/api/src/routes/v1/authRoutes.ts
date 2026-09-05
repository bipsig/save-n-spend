import { Router } from 'express';
import { changePassword, login, me, register } from '../../controllers/authController';
import { protect } from '../../middleware/authMiddleware';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post ('/register', authLimiter, register);
router.post ('/login', authLimiter, login);
router.get ('/me', protect, me);
// Rate-limited like login: it takes the current password, so it is one more
// place a wrong guess can be tried.
router.post ('/change-password', authLimiter, protect, changePassword);

export default router;

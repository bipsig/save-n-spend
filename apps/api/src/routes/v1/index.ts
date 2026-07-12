import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes'
import accountRoutes from "./accountRoutes";

const router = Router();

router.use ('/auth', authRoutes);
router.use ('/users', userRoutes);
router.use ('/accounts', accountRoutes);

export default router;
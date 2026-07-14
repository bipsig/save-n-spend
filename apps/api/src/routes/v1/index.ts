import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes'
import accountRoutes from "./accountRoutes";
import categoryRoutes from "./categoryRoutes";
import transactionRoutes from "./transactionRoutes";

const router = Router();

router.use ('/auth', authRoutes);
router.use ('/users', userRoutes);
router.use ('/accounts', accountRoutes);
router.use ('/categories', categoryRoutes);
router.use ('/transactions', transactionRoutes);

export default router;
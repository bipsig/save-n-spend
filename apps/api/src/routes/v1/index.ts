import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes'
import accountRoutes from "./accountRoutes";
import categoryRoutes from "./categoryRoutes";
import transactionRoutes from "./transactionRoutes";
import dashboardRoutes from "./dashboardRoutes";
import budgetRoutes from "./budgetRoutes";
import billRoutes from "./billRoutes";
import goalRoutes from "./goalRoutes";
import insightsRoutes from "./insightsRoutes";
import notificationRoutes from "./notificationRoutes";
import highlightRoutes from "./highlightRoutes";

const router = Router();

router.use ('/auth', authRoutes);
router.use ('/users', userRoutes);
router.use ('/accounts', accountRoutes);
router.use ('/categories', categoryRoutes);
router.use ('/transactions', transactionRoutes);
router.use ('/dashboard', dashboardRoutes);
router.use ('/budgets', budgetRoutes);
router.use ('/bills', billRoutes);
router.use ('/goals', goalRoutes);
router.use ('/insights', insightsRoutes);
router.use ('/notifications', notificationRoutes);
router.use ('/highlights', highlightRoutes);

export default router;
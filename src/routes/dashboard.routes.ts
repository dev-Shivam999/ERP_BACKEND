import { Router } from 'express';
import { getGeneralStats, getFinancialStats, getAnalyticsStats } from '../controllers/dashboard.controller';

const router = Router();

// GET /api/dashboard/stats/general - Get general counts (students, teachers, etc)
router.get('/stats/general', getGeneralStats);

// GET /api/dashboard/stats/financial - Get fee collections and defaulters
router.get('/stats/financial', getFinancialStats);

// GET /api/dashboard/stats/analytics - Get charts data (weekly attendance, etc)
router.get('/stats/analytics', getAnalyticsStats);

export default router;

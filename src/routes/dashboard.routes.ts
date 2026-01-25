import { Router } from 'express';
import { getStats } from '../controllers/dashboard.controller';

const router = Router();

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', getStats);

export default router;

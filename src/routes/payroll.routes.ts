import { Router } from 'express';
import { authenticate, teacherAccess } from '../middleware';
import { getMySalaryHistory } from '../controllers/payroll.controller';

const router = Router();

router.use(authenticate);

// Teacher routes
// Teacher routes
router.get('/me/history', teacherAccess, getMySalaryHistory);

// Admin routes
import { isAdmin } from '../middleware';
import { getPayrollByMonth, processPayroll } from '../controllers/payroll.controller';

router.get('/monthly', isAdmin, getPayrollByMonth);
router.post('/process', isAdmin, processPayroll);

export default router;

import { Router } from 'express';
import * as installmentController from '../controllers/installment.controller.js';
import { authenticate, adminOnly, hasPermission } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/installments - Get all installment plans
router.get('/', adminOnly, installmentController.getInstallmentPlans);

// POST /api/installments - Create a new installment plan
router.post('/', adminOnly, installmentController.createInstallmentPlan);

// PUT /api/installments/:id - Update an installment plan
router.put('/:id', adminOnly, installmentController.updateInstallmentPlan);

// DELETE /api/installments/:id - Delete an installment plan
router.delete('/:id', adminOnly, installmentController.deleteInstallmentPlan);

export default router;

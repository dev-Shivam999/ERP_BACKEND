import { Router } from 'express';
import * as feeController from '../controllers/fee.controller.js';
import { authenticate, adminOnly, feeCollectorAccess, managementAccess, hasPermission } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/fees/structures - Get all fee structures
router.get('/structures', hasPermission('collect_fees'), feeController.getFeeStructures);

// PUT /api/fees/structures - Bulk update fee structures
router.put('/structures', adminOnly, feeController.updateFeeStructures);

// POST /api/fees/structures/initialize - Initialize fee structures
router.post('/structures/initialize', adminOnly, feeController.initializeFeeStructures);

// GET /api/fees/metadata - Get classes and fee types
router.get('/metadata', hasPermission('collect_fees'), feeController.getFeeMetadata);

// POST /api/fees/types - Create new fee type
router.post('/types', adminOnly, feeController.createFeeType);

// DELETE /api/fees/types/:id - Delete a fee type
router.delete('/types/:id', adminOnly, feeController.deleteFeeType);

// GET /api/fees/student/me - Get current student's fee details
router.get('/student/me', feeController.getMyFees);

// GET /api/fees/student/:studentId - Get student fee details
router.get('/student/:studentId', hasPermission('collect_fees'), feeController.getStudentFees);

// PUT /api/fees/:id - Update student fee (manual override)
router.put('/:id', hasPermission('collect_fees'), feeController.updateStudentFee);

// POST /api/fees/collect - Collect fee payment
router.post('/collect', hasPermission('collect_fees'), feeController.collectFee);

// GET /api/fees/receipt/:receiptNumber - Get fee receipt
router.get('/receipt/:receiptNumber', hasPermission('collect_fees'), feeController.getReceipt);

// GET /api/fees/payments - Get all fee payments (for list)
router.get('/payments', hasPermission('collect_fees'), feeController.getAllPayments);

// POST /api/fees/payments - Record a payment
router.post('/payments', hasPermission('collect_fees'), feeController.recordPayment);

// GET /api/fees/pending - Get pending fees list
router.get('/pending', hasPermission('collect_fees'), feeController.getPendingFees);

// GET /api/fees/defaulters - Get fee defaulters
router.get('/defaulters', hasPermission('view_reports'), feeController.getDefaulters);

// GET /api/fees/collection/daily - Get daily collection report
router.get('/collection/daily', hasPermission('view_reports'), feeController.getDailyCollection);

// GET /api/fees/collection/monthly - Get monthly collection report
router.get('/collection/monthly', hasPermission('view_reports'), feeController.getMonthlyCollection);

// POST /api/fees/generate - Generate fees for a class/month
router.post('/generate', adminOnly, feeController.generateFees);

// GET /api/fees/collection/detail - Get detailed collection (today/yearly)
router.get('/collection/detail', hasPermission('collect_fees'), feeController.getCollectionsDetail);

// GET /api/fees/pending/detail - Get detailed pending fees
router.get('/pending/detail', hasPermission('collect_fees'), feeController.getPendingFeesDetail);

// POST /api/fees/discount - Apply fee discount
router.post('/discount', adminOnly, feeController.applyDiscount);

export default router;

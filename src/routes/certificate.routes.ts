import { Router } from 'express';
import * as certificateController from '../controllers/certificate.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Student routes
router.post('/request', authenticate, authorize(['student']), certificateController.requestCertificate);
router.get('/my-requests', authenticate, authorize(['student']), certificateController.getStudentRequests);

// Admin routes
router.get('/pending', authenticate, authorize(['admin', 'management']), certificateController.getPendingRequests);
router.get('/today', authenticate, authorize(['admin', 'management']), certificateController.getTodayRequests);
router.put('/:id/status', authenticate, authorize(['admin', 'management']), certificateController.updateRequestStatus);
router.delete('/:id', authenticate, authorize(['admin', 'management']), certificateController.deleteRequest);

// Common route for generation
router.get('/:id/data', authenticate, certificateController.getCertificateData);

export default router;

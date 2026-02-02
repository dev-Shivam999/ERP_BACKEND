import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/me', notificationController.getMyNotifications);

// Admin routes for FCM testing
router.get('/fcm-users', adminOnly, notificationController.getUsersWithFcmToken);
router.post('/send-test', adminOnly, notificationController.sendTestNotification);
router.post('/remove-token', adminOnly, notificationController.removeFcmToken);

export default router;

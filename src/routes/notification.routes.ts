import { Router } from 'express';
import { authenticate } from '../middleware';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/me', notificationController.getMyNotifications);

export default router;

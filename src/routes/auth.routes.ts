import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// POST /api/auth/login - User login
router.post('/login', authController.login);

// POST /api/auth/register - Register new user (Admin only in protected route)
router.post('/register', authController.register);

// GET /api/auth/me - Get current user profile
router.get('/me', authController.getCurrentUser);

// POST /api/auth/change-password - Change password
router.post('/change-password', authController.changePassword);

// POST /api/auth/reset-password-admin - Reset password by admin
router.post('/reset-password-admin', authController.adminResetPassword);

// POST /api/auth/update-permissions-admin - Update user permissions by admin
router.post('/update-permissions-admin', authController.updateUserPermissions);

export default router;

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config';
import { authenticate, generateToken, isAdmin } from '../middleware';
import { successResponse, errorResponse } from '../utils';
import { LoginRequest, JwtPayload } from '../types';

// Login user
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password }: LoginRequest = req.body;

        if (!email || !password) {
            errorResponse(res, 'Email and password are required', 400);
            return;
        }

        // Find user by email
        const userResult = await query(
            `SELECT u.id, u.school_id, u.email, u.password_hash, u.role, u.is_active, u.permissions,
              up.first_name, up.last_name, up.photo_url,
              s.status as student_status
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN students s ON u.id = s.user_id
       WHERE u.email = $1`,
            [email.toLowerCase()]
        );

        if (userResult.rows.length === 0) {
            errorResponse(res, 'Invalid email', 401);
            return;
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            errorResponse(res, 'Account is deactivated. Please contact admin.', 401);
            return;
        }

        // Check student status
        if (user.role === 'student' && user.student_status && user.student_status !== 'active') {
            errorResponse(res, `Login failed: Your account status is ${user.student_status}. Please contact office to reactivate.`, 401);
            return;
        }

      

        // Update last login
        await query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Generate JWT token
        const payload: JwtPayload = {
            userId: user.id,
            schoolId: user.school_id,
            role: user.role,
            email: user.email,
            permissions: user.permissions || {},
        };

        console.log('🔑 Login successful - Generating token for:', user.email, 'Role:', user.role);
        const token = generateToken(payload);

        successResponse(res, 'Login successful', {
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                permissions: user.permissions || {},
                profile: {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    photoUrl: user.photo_url,
                },
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        errorResponse(res, 'Login failed', 500);
    }
};

// Register new user (Admin only)
export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, phone, role, profile, schoolId } = req.body;

        // Validate required fields
        if (!email || !password || !role || !profile?.first_name) {
            errorResponse(res, 'Missing required fields', 400);
            return;
        }

        // Check if email already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            errorResponse(res, 'Email already registered', 400);
            return;
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Insert user
        const userResult = await query(
            `INSERT INTO users (school_id, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
            [schoolId, email.toLowerCase(), passwordHash, phone, role]
        );

        const userId = userResult.rows[0].id;

        // Insert profile
        await query(
            `INSERT INTO user_profiles (user_id, first_name, last_name, gender, date_of_birth, address, city, state, pincode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                userId,
                profile.first_name,
                profile.last_name || null,
                profile.gender || null,
                profile.date_of_birth || null,
                profile.address || null,
                profile.city || null,
                profile.state || null,
                profile.pincode || null,
            ]
        );

        successResponse(res, 'User registered successfully', { userId }, 201);
    } catch (error) {
        console.error('Registration error:', error);
        errorResponse(res, 'Registration failed', 500);
    }
};

// Get current user
export const getCurrentUser = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;

            const result = await query(
                `SELECT u.id, u.email, u.phone, u.role, u.is_active, u.last_login, u.permissions,
                up.first_name, up.last_name, up.gender, up.date_of_birth,
                up.address, up.city, up.state, up.pincode, up.photo_url,
                s.name as school_name
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         LEFT JOIN schools s ON u.school_id = s.id
         WHERE u.id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                errorResponse(res, 'User not found', 404);
                return;
            }

            const user = result.rows[0];

            successResponse(res, 'User profile fetched', {
                id: user.id,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.is_active,
                lastLogin: user.last_login,
                permissions: user.permissions || {},
                schoolName: user.school_name,
                profile: {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    gender: user.gender,
                    dateOfBirth: user.date_of_birth,
                    address: user.address,
                    city: user.city,
                    state: user.state,
                    pincode: user.pincode,
                    photoUrl: user.photo_url,
                },
            });
        } catch (error) {
            console.error('Get current user error:', error);
            errorResponse(res, 'Failed to fetch user profile', 500);
        }
    },
];

// Change password
export const changePassword = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                errorResponse(res, 'Current and new password are required', 400);
                return;
            }

            // Get current password hash
            const userResult = await query(
                'SELECT password_hash FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                errorResponse(res, 'User not found', 404);
                return;
            }

            // Verify current password
            const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);

            if (!isValid) {
                errorResponse(res, 'Current password is incorrect', 400);
                return;
            }

            // Hash and update new password
            const newPasswordHash = await bcrypt.hash(newPassword, 12);

            await query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newPasswordHash, userId]
            );

            successResponse(res, 'Password changed successfully');
        } catch (error) {
            console.error('Change password error:', error);
            errorResponse(res, 'Failed to change password', 500);
        }
    },
];

// Admin reset password for any user
export const adminResetPassword = [
    authenticate,
    isAdmin,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { targetUserId, userId, newPassword } = req.body;
            const finalUserId = targetUserId || userId;

            if (!finalUserId || !newPassword) {
                console.error('Password reset missing params:', { targetUserId, userId, hasPassword: !!newPassword });
                errorResponse(res, 'Target user ID and new password are required', 400);
                return;
            }

            const trimmedPassword = newPassword.trim();
            if (!trimmedPassword) {
                errorResponse(res, 'Password cannot be empty spaces', 400);
                return;
            }

            // Verify user exists and get their identity for logging
            const userCheck = await query('SELECT email FROM users WHERE id = $1', [finalUserId]);
            if (userCheck.rows.length === 0) {
                console.error(`Password reset failed: User ID ${finalUserId} not found`);
                errorResponse(res, 'User not found in system', 404);
                return;
            }

            const targetUser = userCheck.rows[0];

            // Hash new password

            await query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [trimmedPassword, finalUserId]
            );

            console.log(`🔐 PASSWORD UPDATED: User ${targetUser.email} (ID: ${finalUserId}) result: SUCCESS`);
            successResponse(res, `Password updated successfully for ${targetUser.email}`);
        } catch (error) {
            console.error('Admin password reset error:', error);
            errorResponse(res, 'Failed to reset user password', 500);
        }
    },
];

// Update user permissions by admin
export const updateUserPermissions = [
    authenticate,
    isAdmin,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { targetUserId, permissions } = req.body;

            if (!targetUserId || permissions === undefined) {
                errorResponse(res, 'Target user ID and permissions are required', 400);
                return;
            }

            await query(
                'UPDATE users SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(permissions), targetUserId]
            );

            successResponse(res, 'User permissions updated successfully');
        } catch (error) {
            console.error('Update permissions error:', error);
            errorResponse(res, 'Failed to update user permissions', 500);
        }
    },
];

// Update FCM Token
export const updateFcmToken = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;
            const { fcmToken } = req.body;

            if (!fcmToken) {
                errorResponse(res, 'FCM token is required', 400);
                return;
            }

            await query(
                'UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [fcmToken, userId]
            );

            successResponse(res, 'FCM token updated successfully');
        } catch (error) {
            console.error('Update FCM token error:', error);
            errorResponse(res, 'Failed to update FCM token', 500);
        }
    },
];

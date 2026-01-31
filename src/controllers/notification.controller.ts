import { Request, Response } from 'express';
import { query } from '../config/database';
import { successResponse, errorResponse } from '../utils/response';
import { messaging } from '../config/firebase';

/**
 * Get notifications for the current user
 * This endpoint is used by the mobile app to show "Recent Updates"
 */
export const getMyNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            errorResponse(res, 'User not authenticated', 401);
            return;
        }

        // Fetch notifications where target_ids contains this user_id
        // or where target_type is 'all'
        const result = await query(
            `SELECT * FROM notifications 
             WHERE (target_type = 'individual' AND target_ids @> jsonb_build_array($1::text))
                OR (target_type = 'all')
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );

        // Format for mobile app
        const formattedNotifications = result.rows.map(notif => ({
            id: notif.id,
            type: notif.notification_type,
            title: notif.title,
            message: notif.message,
            time: formatTime(notif.created_at)
        }));

        successResponse(res, 'Notifications fetched successfully', formattedNotifications);
    } catch (error) {
        console.error('Get my notifications error:', error);
        errorResponse(res, 'Failed to fetch notifications', 500);
    }
};

/**
 * Get all users who have FCM tokens (for admin testing panel)
 */
export const getUsersWithFcmToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT u.id, u.email, u.phone, u.role, u.fcm_token,
                    up.first_name, up.last_name, up.photo_url
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.school_id = $1 AND u.fcm_token IS NOT NULL AND u.fcm_token != ''
             ORDER BY u.role, up.first_name`,
            [schoolId]
        );

        successResponse(res, 'Users with FCM tokens fetched', result.rows);
    } catch (error) {
        console.error('Get users with FCM token error:', error);
        errorResponse(res, 'Failed to fetch users', 500);
    }
};

/**
 * Send a test push notification to a specific user
 */
export const sendTestNotification = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, title, message } = req.body;

        if (!userId || !title || !message) {
            errorResponse(res, 'userId, title, and message are required', 400);
            return;
        }

        // Fetch user's FCM Token
        const userResult = await query(
            `SELECT fcm_token FROM users WHERE id = $1`,
            [userId]
        );

        const fcmToken = userResult.rows[0]?.fcm_token;

        if (!fcmToken) {
            errorResponse(res, 'User does not have an FCM token', 400);
            return;
        }

        const messagePayload = {
            notification: {
                title,
                body: message,
            },
            data: {
                type: 'test',
                sentAt: new Date().toISOString(),
            },
            token: fcmToken,
        };

        const response = await messaging.send(messagePayload);
        console.log('Test notification sent:', response);

        successResponse(res, 'Test notification sent successfully', { messageId: response });
    } catch (error: any) {
        console.error('Send test notification error:', error);
        errorResponse(res, error.message || 'Failed to send notification', 500);
    }
};

// Helper to format time relative to now or as a string
function formatTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
}

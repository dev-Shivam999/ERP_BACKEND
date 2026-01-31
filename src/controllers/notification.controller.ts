import { Request, Response } from 'express';
import { query } from '../config/database';
import { successResponse, errorResponse } from '../utils/response';

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

import { query, config } from '../config';
import { PoolClient } from 'pg';

/**
 * Sends a notification to a single student if they are active.
 * 
 * @param studentId The ID of the student (UUID)
 * @param title Notification title
 * @param message Notification message
 * @param type Notification type (e.g., 'homework', 'exam', 'general', 'result')
 * @param priority Priority ('high', 'normal', 'low')
 * @param createdBy User ID of the creator
 * @param schoolId School ID
 * @param client Optional database client for transaction support
 * @returns true if sent, false if student not found or inactive
 */
export const sendStudentNotification = async (
    studentId: string,
    title: string,
    message: string,
    type: string,
    priority: string,
    createdBy: string,
    schoolId: string,
    client?: PoolClient
): Promise<boolean> => {
    try {
        const dbQuery = client ? client.query.bind(client) : query;

        // Fetch student user_id and status
        const studentResult = await dbQuery(
            `SELECT user_id, status FROM students WHERE id = $1`,
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return false; // Student not found
        }

        const student = studentResult.rows[0];

        if (student.status !== 'active') {
            return false; // Student is not active
        }

        // Insert notification
        await dbQuery(
            `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
             VALUES ($1, $2, $3, $4, $5, 'individual', jsonb_build_array($6::uuid), $7)`,
            [schoolId, title, message, type, priority, student.user_id, createdBy]
        );

        // Send OneSignal Push Notification
        try {
            // Fetch user's OneSignal Player ID
            const userResult = await dbQuery(
                `SELECT onesignal_player_id FROM users WHERE id = $1`,
                [student.user_id]
            );

            const playerId = userResult.rows[0]?.onesignal_player_id;

            if (playerId && config.oneSignal.appId && config.oneSignal.apiKey) {
                const oneSignalPayload = {
                    app_id: config.oneSignal.appId,
                    include_player_ids: [playerId],
                    headings: { en: title },
                    contents: { en: message },
                    data: { type, studentId }
                };

                await fetch('https://onesignal.com/api/v1/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${config.oneSignal.apiKey}`
                    },
                    body: JSON.stringify(oneSignalPayload)
                });
            }
        } catch (pushError) {
            console.error('Failed to send OneSignal notification:', pushError);
            // Don't fail the whole operation if push fails
        }

        return true;
    } catch (error) {
        console.error(`Error sending student notification to ${studentId}:`, error);
        return false;
    }
};

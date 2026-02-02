import { query } from "../config";
import { messaging } from "../config/firebase";

export const processAbsentNotifications = async (absentStudents: any[], date: string, userId: string) => {
    try {
        const studentIds = absentStudents.map(s => s.student_id);

        // 1. Bulk fetch parents using View
        const parentsResult = await query(
            `SELECT student_id, school_id, parent_user_id, fcm_token
             FROM vw_student_primary_parents
             WHERE student_id = ANY($1::uuid[])`,
            [studentIds]
        );

        if (parentsResult.rows.length === 0) return;

        console.log(`Processing ${parentsResult.rows.length} absent notifications in background`);

        const title = 'बच्चा आज Absent है / Child Absent Today';
        const message = `आपका बच्चा आज (${date}) स्कूल में अनुपस्थित है। Your child is absent from school today.`;

        // 2. Bulk Insert into DB using Stored Procedure
        const schoolIds = parentsResult.rows.map(r => r.school_id);
        const parentUserIds = parentsResult.rows.map(r => r.parent_user_id);

        await query(
            `CALL sp_bulk_insert_notifications($1, $2, 'attendance', 'high', $3, $4::uuid[], $5::uuid[])`,
            [title, message, userId, schoolIds, parentUserIds]
        );

        // 3. Send FCM in parallel
        const fcmPromises = parentsResult.rows
            .filter(row => row.fcm_token)
            .map(async (row) => {
                try {
                    const messagePayload = {
                        notification: { title, body: message },
                        data: { type: 'attendance', userId: row.parent_user_id },
                        token: row.fcm_token,
                    };
                    await messaging.send(messagePayload);
                } catch (e) {
                    console.error(`FCM failed for ${row.parent_user_id}:`, e);
                }
            });

        if (fcmPromises.length > 0) {
            await Promise.all(fcmPromises);
            console.log(`Sent ${fcmPromises.length} FCM notifications`);
        }

        console.log('Finished background notification processing');
    } catch (error) {
        console.error('Error in processAbsentNotifications:', error);
    }
};
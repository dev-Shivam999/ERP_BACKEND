import { query } from "../config";
import { messaging } from "../config/firebase";

export const processResultNotifications = async (examId: string, examName: string, userId: string, schoolId: string) => {
    try {
        // 1. Get target classes for this exam
        const classesRes = await query(
            `SELECT DISTINCT class_id FROM exam_schedules WHERE exam_id = $1`,
            [examId]
        );
        const classIds = classesRes.rows.map(r => r.class_id);

        if (classIds.length === 0) return;

        // 2. Bulk fetch parents using View
        const parentsResult = await query(
            `SELECT student_id, school_id, parent_user_id, fcm_token
             FROM vw_student_primary_parents
             WHERE current_class_id = ANY($1::uuid[]) 
               AND student_status = 'active'`,
            [classIds]
        );

        if (parentsResult.rows.length === 0) return;

        console.log(`Processing result notifications for ${parentsResult.rows.length} parents`);

        const title = 'Exam Results Published';
        const message = `The results for ${examName} have been published. You can now view and download the marksheet from the app.`;

        // 3. Bulk Insert into DB using Stored Procedure
        const schoolIds = parentsResult.rows.map(r => r.school_id);
        const parentUserIds = parentsResult.rows.map(r => r.parent_user_id);

        await query(
            `CALL sp_bulk_insert_notifications($1, $2, 'result', 'high', $3, $4::uuid[], $5::uuid[])`,
            [title, message, userId, schoolIds, parentUserIds]
        );

        // 4. Send FCM in parallel
        const fcmPromises = parentsResult.rows
            .filter(row => row.fcm_token)
            .map(async (row) => {
                try {
                    const messagePayload = {
                        notification: { title, body: message },
                        data: { type: 'result', examId, userId: row.parent_user_id },
                        token: row.fcm_token,
                    };
                    await messaging.send(messagePayload);
                } catch (e) {
                    console.error(`FCM failed for ${row.parent_user_id}:`, e);
                }
            });

        if (fcmPromises.length > 0) {
            await Promise.all(fcmPromises);
            console.log(`Sent ${fcmPromises.length} FCM result notifications`);
        }

    } catch (error) {
        console.error('Error in processResultNotifications:', error);
    }
};
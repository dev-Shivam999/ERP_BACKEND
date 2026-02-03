import { query } from "../config";
import { expo } from "../config/expo";
import { Expo } from "expo-server-sdk";

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
        console.log(JSON.stringify(parentsResult.rows));
        

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
        // 4. Prepare Expo messages
        const messages: any[] = [];
        for (const row of parentsResult.rows) {
            if (!Expo.isExpoPushToken(row.fcm_token)) {
                console.error(`Push token ${row.fcm_token} is not a valid Expo push token`);
                continue;
            }
            

            messages.push({
                to: row.fcm_token,
                sound: 'default',
                title: title,
                body: message,
                data: { type: 'result', examId, userId: row.parent_user_id },
            });
        }

        // 5. Send chunks
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Error sending chunk:', error);
            }
        }

        // 6. Check for errors
        const errors = tickets.filter(ticket => ticket.status === 'error');
        if (errors.length > 0) {
            console.error('Errors in push tickets:', errors);
        }

        console.log(`Sent ${tickets.length} result notifications`);



    } catch (error) {
        console.error('Error in processResultNotifications:', error);
    }
};
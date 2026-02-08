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

        // 2. Bulk fetch parents using View joined with user_devices AND legacy users table
        const parentsResult = await query(
            `
            SELECT v.student_id, v.school_id, v.parent_user_id, ud.fcm_token
            FROM vw_student_primary_parents v
            JOIN user_devices ud ON v.parent_user_id = ud.user_id
            WHERE v.current_class_id = ANY($1::uuid[]) 
              AND v.student_status = 'active'
              
            UNION
            
            SELECT v.student_id, v.school_id, v.parent_user_id, u.fcm_token
            FROM vw_student_primary_parents v
            JOIN users u ON v.parent_user_id = u.id
            WHERE v.current_class_id = ANY($1::uuid[]) 
              AND v.student_status = 'active'
              AND u.fcm_token IS NOT NULL
            `,
            [classIds]
        );

        if (parentsResult.rows.length === 0) return;

        console.log(`Processing result notifications for ${parentsResult.rows.length} devices`);

        const title = 'Exam Results Published';
        const message = `The results for ${examName} have been published. You can now view and download the marksheet from the app.`;

        // 3. Bulk Insert into DB (Unique parent users only)
        const uniqueParents = new Map();
        parentsResult.rows.forEach(r => {
            if (!uniqueParents.has(r.parent_user_id)) {
                uniqueParents.set(r.parent_user_id, { school_id: r.school_id, user_id: r.parent_user_id });
            }
        });

        const schoolIds = Array.from(uniqueParents.values()).map((p: any) => p.school_id);
        const parentUserIds = Array.from(uniqueParents.values()).map((p: any) => p.user_id);

        await query(
            `CALL sp_bulk_insert_notifications($1, $2, 'result', 'high', $3, $4::uuid[], $5::uuid[])`,
            [title, message, userId, schoolIds, parentUserIds]
        );

        // 4. Send FCM (To all devices)
        const messages: any[] = [];
        for (const row of parentsResult.rows) {
            if (!row.fcm_token || !Expo.isExpoPushToken(row.fcm_token)) {
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

        console.log(`Sent ${tickets.length} result push notifications`);

    } catch (error) {
        console.error('Error in processResultNotifications:', error);
    }
};
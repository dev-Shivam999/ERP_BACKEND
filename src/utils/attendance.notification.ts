import { query } from "../config";
import { expo } from "../config/expo";
import { Expo } from "expo-server-sdk";

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
        // 3. Prepare Expo messages 
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
                data: { type: 'attendance', userId: row.parent_user_id },
            });
        }

        // 4. Send chunks
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

        // 5. Check for errors
        const errors = tickets.filter(ticket => ticket.status === 'error');
        if (errors.length > 0) {
            console.error('Errors in push tickets:', errors);
        }

        console.log(`Sent ${tickets.length} notifications`);



        console.log('Finished background notification processing');
    } catch (error) {
        console.error('Error in processAbsentNotifications:', error);
    }
};
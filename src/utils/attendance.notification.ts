import { query } from "../config";
import { expo } from "../config/expo";
import { Expo } from "expo-server-sdk";

export const processAbsentNotifications = async (absentStudents: any[], date: string, userId: string) => {
    try {
        const studentIds = absentStudents.map(s => s.student_id);

        // 1. Bulk fetch parents using View joined with user_devices AND legacy users table
        // We fetch from both to support old apps (users.fcm_token) and new apps (user_devices)
        const parentsResult = await query(
            `
            SELECT v.student_id, v.school_id, v.parent_user_id, ud.fcm_token
            FROM vw_student_primary_parents v
            JOIN user_devices ud ON v.parent_user_id = ud.user_id
            WHERE v.student_id = ANY($1::uuid[])
            
            UNION
            
            SELECT v.student_id, v.school_id, v.parent_user_id, u.fcm_token
            FROM vw_student_primary_parents v
            JOIN users u ON v.parent_user_id = u.id
            WHERE v.student_id = ANY($1::uuid[]) AND u.fcm_token IS NOT NULL
            `,
            [studentIds]
        );

        if (parentsResult.rows.length === 0) return;

        console.log(`Processing absent notifications for ${parentsResult.rows.length} devices in background`);

        const title = 'बच्चा आज Absent है / Child Absent Today';
        const message = `आपका बच्चा आज (${date}) स्कूल में अनुपस्थित है। Your child is absent from school today.`;

        // 2. Bulk Insert into DB (One notification per parent user, not per device)
        // We need unique parent user IDs for DB insertion to avoid duplicate alerts in in-app list
        const uniqueParents = new Map();
        parentsResult.rows.forEach(r => {
            if (!uniqueParents.has(r.parent_user_id)) {
                uniqueParents.set(r.parent_user_id, { school_id: r.school_id, user_id: r.parent_user_id });
            }
        });

        const schoolIds = Array.from(uniqueParents.values()).map((p: any) => p.school_id);
        const parentUserIds = Array.from(uniqueParents.values()).map((p: any) => p.user_id);

        await query(
            `CALL sp_bulk_insert_notifications($1, $2, 'attendance', 'high', $3, $4::uuid[], $5::uuid[])`,
            [title, message, userId, schoolIds, parentUserIds]
        );

        // 3. Send FCM (To all devices)
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

        console.log(`Sent ${tickets.length} push notifications`);
    } catch (error) {
        console.error('Error in processAbsentNotifications:', error);
    }
};
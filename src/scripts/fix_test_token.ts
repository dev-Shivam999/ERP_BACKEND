import { query, closePool } from '../config/database';

async function fixToken() {
    const parentEmail = 'father.std2026001@school.local';
    const token = 'ExponentPushToken[laM4azCkSlLvqIXdy9n4bD]';

    try {
        console.log(`Setting token for ${parentEmail}...`);
        await query('UPDATE users SET fcm_token = $1 WHERE email = $2', [token, parentEmail]);
        console.log('Done! Now try triggering the notification again.');
    } catch (e) {
        console.error(e);
    } finally {
        await closePool();
    }
}

fixToken();

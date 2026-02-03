import { query, closePool } from '../config/database';

async function findTokenOwner() {
    const token = 'ExponentPushToken[laM4azCkSlLvqIXdy9n4bD]';

    try {
        console.log(`--- Finding User with Token: ${token} ---`);
        const u = await query('SELECT id, email, role, fcm_token FROM users WHERE fcm_token = $1', [token]);

        if (u.rows.length > 0) {
            console.log('User found:', u.rows[0]);
        } else {
            console.log('No user found with this token.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await closePool();
    }
}

findTokenOwner();

import { query, closePool } from '../config/database';

async function debugToken() {
    const studentId = '53919462-ea6a-4793-a388-0675e0826c31';

    try {
        console.log('--- Debugging Student ---');
        const s = await query('SELECT id, user_id FROM students WHERE id = $1', [studentId]);
        console.log('Student:', s.rows[0]);

        console.log('\n--- Debugging Student Parents ---');
        const sp = await query('SELECT * FROM student_parents WHERE student_id = $1', [studentId]);
        console.log('Student Parents:', sp.rows);

        if (sp.rows.length > 0) {
            const parentId = sp.rows[0].parent_id;
            console.log(`\n--- Debugging Parent (${parentId}) ---`);
            const p = await query('SELECT * FROM parents WHERE id = $1', [parentId]);
            console.log('Parent:', p.rows[0]);

            if (p.rows.length > 0) {
                const userId = p.rows[0].user_id;
                console.log(`\n--- Debugging User (${userId}) ---`);
                const u = await query('SELECT id, email, fcm_token FROM users WHERE id = $1', [userId]);
                console.log('User:', u.rows[0]);
            }
        }

        console.log('\n--- Debugging View Output ---');
        const v = await query('SELECT * FROM vw_student_primary_parents WHERE student_id = $1', [studentId]);
        console.log('View Row:', v.rows[0]);

    } catch (e) {
        console.error(e);
    } finally {
        await closePool();
    }
}

debugToken();

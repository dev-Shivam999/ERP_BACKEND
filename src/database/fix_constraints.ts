import { query } from '../config/database';

async function fixConstraints() {
    console.log('🚀 Starting Database Constraint Fix (v2)...');

    try {
        // 1. result_sessions
        const sessionDupes = await query(
            `SELECT school_id, exam_id, count(*) FROM result_sessions GROUP BY school_id, exam_id HAVING count(*) > 1`
        );
        if (sessionDupes.rows.length > 0) {
            console.log('⚠️ Cleaning duplicates in result_sessions...');
            await query(`DELETE FROM result_sessions a USING result_sessions b WHERE a.id < b.id AND a.school_id = b.school_id AND a.exam_id = b.exam_id`);
        }
        await query(`
            DO $$ BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'result_sessions_school_exam_key') THEN
                    ALTER TABLE result_sessions ADD CONSTRAINT result_sessions_school_exam_key UNIQUE (school_id, exam_id);
                END IF;
            END $$;
        `);
        console.log('✅ result_sessions fixed.');

        // 2. student_results
        await query(`
            DO $$ BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_results_session_student_key') THEN
                    ALTER TABLE student_results ADD CONSTRAINT student_results_session_student_key UNIQUE (result_session_id, student_id);
                END IF;
            END $$;
        `);
        console.log('✅ student_results fixed.');

        // 3. result_notifications (CRITICAL)
        console.log('Checking result_notifications...');
        const notifDupes = await query(
            `SELECT result_session_id, student_id, count(*) FROM result_notifications GROUP BY result_session_id, student_id HAVING count(*) > 1`
        );
        if (notifDupes.rows.length > 0) {
            console.log('⚠️ Cleaning duplicates in result_notifications...');
            await query(`DELETE FROM result_notifications a USING result_notifications b WHERE a.id < b.id AND a.result_session_id = b.result_session_id AND a.student_id = b.student_id`);
        }
        await query(`
            DO $$ BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'result_notifications_session_student_key') THEN
                    ALTER TABLE result_notifications ADD CONSTRAINT result_notifications_session_student_key UNIQUE (result_session_id, student_id);
                END IF;
            END $$;
        `);
        console.log('✅ result_notifications fixed.');

        console.log('🎉 Database fix completed successfully!');
    } catch (error: any) {
        console.error('❌ Error fixing constraints:', error.message);
    } finally {
        process.exit(0);
    }
}

fixConstraints();

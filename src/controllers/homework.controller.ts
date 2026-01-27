import { Request, Response } from 'express';
import { query } from '../config/database';

export const createHomework = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId, sectionId, subjectId, title, description, dueDate } = req.body;

        // Fetch teacher_id from teachers table using user_id from token
        const teacherResult = await query(
            'SELECT id FROM teachers WHERE user_id = $1',
            [req.user?.userId]
        );

        if (teacherResult.rows.length === 0) {
            res.status(403).json({ success: false, message: 'Teacher profile not found' });
            return;
        }

        const teacherId = teacherResult.rows[0].id;

        // 1. Create Homework Entry
        const homeworkResult = await query(
            `INSERT INTO homework (class_id, section_id, subject_id, teacher_id, title, description, due_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [classId, sectionId, subjectId, teacherId, title, description, dueDate]
        );
        const homeworkId = homeworkResult.rows[0].id;

        // 2. Assign to all students in the class/section
        // Get all students in this class/section
        const studentsResult = await query(
            `SELECT id FROM students WHERE current_class_id = $1 AND section_id = $2 AND status = 'active'`,
            [classId, sectionId]
        );

        // Bulk insert into student_homework
        if (studentsResult.rows.length > 0) {
            const values = studentsResult.rows.map((s, i) => `($1, $${i + 2})`).join(',');
            const params = [homeworkId, ...studentsResult.rows.map(s => s.id)];

            await query(
                `INSERT INTO student_homework (homework_id, student_id) VALUES ${values}`,
                params
            );

            // 3. Create Notifications for Students
            const studentIds = studentsResult.rows.map(s => s.id);
            // We can do this in a loop or a bulk insert if supported. 
            // For simplicity and to use the notifications table structure:
            const notificationQuery = `
                INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
                VALUES ($1, $2, $3, 'homework', 'normal', 'individual', $4, $5)
            `;

            // We'll create one notification entry targeting all students (if target_ids supports array) 
            // OR distinct notifications. 
            // Looking at the attendance controller example: 
            // "target_type": 'individual', "target_ids": jsonb_build_array(p.user_id)
            // It seems we should target the STUDENT'S USER_ID. 
            // We need to fetch user_ids for these students first.
            const userIdsResult = await query(
                `SELECT user_id FROM students WHERE id = ANY($1)`,
                [studentIds]
            );
            const userIds = userIdsResult.rows.map(r => r.user_id);

            // Loop to send individual notifications (safer for now, or use target_type 'class' if supported)
            // Assuming individual for now based on attendance pattern
            for (const uid of userIds) {
                await query(
                    `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
                     VALUES ($1, 'New Homework: ' || $2, $3, 'homework', 'normal', 'individual', jsonb_build_array($4::uuid), $5)`,
                    [req.user?.schoolId, title, description.substring(0, 50) + '...', uid, req.user?.userId]
                );
            }
        }

        res.status(201).json({
            success: true,
            message: 'Homework assigned successfully',
            data: { id: homeworkId }
        });

    } catch (error: any) {
        console.error('Create homework error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign homework' });
    }
};

export const getHomeworkByClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId, sectionId } = req.params;
        const date = req.query.date as string;

        let sql = `
            SELECT h.*, s.name as subject_name, t.first_name || ' ' || t.last_name as teacher_name
            FROM homework h
            JOIN subjects s ON h.subject_id = s.id
            JOIN teachers t_rec ON h.teacher_id = t_rec.id
            JOIN user_profiles t ON t_rec.user_id = t.user_id
            WHERE h.class_id = $1 AND h.section_id = $2
        `;
        const params: any[] = [classId, sectionId];

        if (date) {
            sql += ` AND h.due_date = $3`;
            params.push(date);
        }

        sql += ` ORDER BY h.due_date DESC`;

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to fetch homework' });
    }
};

export const getStudentHomework = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = req.params.studentId;

        const result = await query(
            `SELECT sh.*, h.title, h.description, h.due_date, s.name as subject_name,
             t.first_name || ' ' || t.last_name as teacher_name
             FROM student_homework sh
             JOIN homework h ON sh.homework_id = h.id
             JOIN subjects s ON h.subject_id = s.id
             JOIN teachers t_rec ON h.teacher_id = t_rec.id
             JOIN user_profiles t ON t_rec.user_id = t.user_id
             WHERE sh.student_id = $1
             ORDER BY h.due_date DESC`,
            [studentId]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to fetch homework' });
    }
};

export const updateHomeworkStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { homeworkId, studentId, status, remarks } = req.body;

        await query(
            `UPDATE student_homework 
             SET status = $1, remarks = $2, updated_at = CURRENT_TIMESTAMP
             WHERE homework_id = $3 AND student_id = $4`,
            [status, remarks, homeworkId, studentId]
        );

        res.json({ success: true, message: 'Status updated' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
};

export const getHomeworkStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { homeworkId } = req.params;

        const result = await query(
            `SELECT sh.*, s.first_name, s.last_name, st.roll_number, st.admission_number 
             FROM student_homework sh
             JOIN students st ON sh.student_id = st.id
             JOIN user_profiles s ON st.user_id = s.user_id
             WHERE sh.homework_id = $1
             ORDER BY st.roll_number`,
            [homeworkId]
        );

        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Fetch status error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch status', error: error.message });
    }
};

export const getSubjectsByClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId } = req.params;
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT id, name, code FROM subjects WHERE school_id = $1 ORDER BY name`,
            [schoolId]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error: any) {
        console.error('Fetch subjects error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subjects' });
    }
};

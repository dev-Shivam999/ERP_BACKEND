import { Request, Response } from 'express';
import { query } from '../config/database';
import { sendStudentNotification } from '../utils/notification.utils';

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

            // Fetch student details to get user_id (though utility does it again, we have the IDs)
            // Actually, the utility takes studentId and fetches user_id internally. 
            // We can just loop through studentIds.

            for (const studentId of studentIds) {
                await sendStudentNotification(
                    studentId,
                    `New Homework: ${title}`,
                    description.substring(0, 50) + '...',
                    'homework',
                    'normal',
                    req.user?.userId || '',
                    req.user?.schoolId || ''
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

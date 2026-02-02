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
        console.log('📚 Fetching students for class:', classId, 'section:', sectionId);
        const studentsResult = await query(
            `SELECT id FROM students WHERE current_class_id = $1 AND section_id = $2 AND status = 'active'`,
            [classId, sectionId]
        );
        console.log('👥 Found students:', studentsResult.rows.length);

        // Bulk insert into student_homework
        if (studentsResult.rows.length > 0) {
            const values = studentsResult.rows.map((s, i) => `($1, $${i + 2})`).join(',');
            const params = [homeworkId, ...studentsResult.rows.map(s => s.id)];

            console.log('💾 Inserting student_homework records for', studentsResult.rows.length, 'students');
            await query(
                `INSERT INTO student_homework (homework_id, student_id) VALUES ${values}`,
                params
            );
            console.log('✅ Student homework records created');

            // 3. Create Notifications for Students
            const studentIds = studentsResult.rows.map(s => s.id);

            // Fetch student details to get user_id (though utility does it again, we have the IDs)
            // Actually, the utility takes studentId and fetches user_id internally. 
            // We can just loop through studentIds.

            console.log('📢 Sending notifications to', studentIds.length, 'students');
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
            console.log('✅ Notifications sent');
        } else {
            console.log('⚠️ No active students found in this class/section');
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
        const days = req.query.days ? parseInt(req.query.days as string) : null;

        console.log('📚 getStudentHomework called for studentId:', studentId, 'days:', days);

        let dateFilter = '';
        if (days) {
            dateFilter = `AND h.due_date >= CURRENT_DATE - INTERVAL '${days} days'`;
        }

        const result = await query(
            `SELECT sh.*, h.title, h.description, h.due_date, h.created_at as assigned_date, s.name as subject_name,
             t.first_name || ' ' || t.last_name as teacher_name
             FROM student_homework sh
             JOIN homework h ON sh.homework_id = h.id
             JOIN subjects s ON h.subject_id = s.id
             JOIN teachers t_rec ON h.teacher_id = t_rec.id
             JOIN user_profiles t ON t_rec.user_id = t.user_id
             WHERE sh.student_id = $1 ${dateFilter}
             ORDER BY h.due_date DESC`,
            [studentId]
        );

        console.log('✅ Found homework records:', result.rows.length);

        // Calculate stats
        const total = result.rows.length;
        const completed = result.rows.filter((hw: any) => hw.status === 'completed').length;
        const pending = result.rows.filter((hw: any) => hw.status === 'pending').length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        res.json({
            success: true,
            data: result.rows,
            stats: {
                total,
                completed,
                pending,
                percentage
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to fetch homework' });
    }
};

// New endpoint: Get homework for logged-in user (works for students)
export const getMyHomework = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const days = req.query.days ? parseInt(req.query.days as string) : null;

        console.log('📚 getMyHomework called for userId:', userId, 'days:', days);

        // First, get the student record for this user
        const studentResult = await query(
            'SELECT id, current_class_id, section_id FROM students WHERE user_id = $1',
            [userId]
        );

        if (studentResult.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Student profile not found', needsLogin: true });
            return;
        }

        const student = studentResult.rows[0];
        console.log('👤 Student found:', student.id, 'Class:', student.current_class_id, 'Section:', student.section_id);

        let dateFilter = '';
        if (days) {
            dateFilter = `AND h.due_date >= CURRENT_DATE - INTERVAL '${days} days'`;
        }

        // Get all homework for student's class/section with their completion status
        const result = await query(
            `SELECT 
                h.id,
                h.title, 
                h.description, 
                h.due_date, 
                h.created_at as assigned_date,
                s.name as subject_name,
                t.first_name || ' ' || t.last_name as teacher_name,
                COALESCE(sh.status, 'pending') as status,
                sh.remarks
             FROM homework h
             JOIN subjects s ON h.subject_id = s.id
             JOIN teachers t_rec ON h.teacher_id = t_rec.id
             JOIN user_profiles t ON t_rec.user_id = t.user_id
             LEFT JOIN student_homework sh ON h.id = sh.homework_id AND sh.student_id = $1
             WHERE h.class_id = $2 AND h.section_id = $3 ${dateFilter}
             ORDER BY h.due_date DESC`,
            [student.id, student.current_class_id, student.section_id]
        );

        console.log('✅ Found homework records:', result.rows.length);

        // Calculate stats
        const total = result.rows.length;
        const completed = result.rows.filter((hw: any) => hw.status === 'completed').length;
        const pending = result.rows.filter((hw: any) => hw.status === 'pending').length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        res.json({
            success: true,
            data: result.rows,
            stats: {
                total,
                completed,
                pending,
                percentage
            }
        });
    } catch (error: any) {
        console.error('❌ getMyHomework error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch homework' });
    }
};

export const updateHomeworkStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { homeworkId, studentId, status, remarks } = req.body;

        console.log('📝 Updating homework status:', { homeworkId, studentId, status, remarks });

        // Check if student_homework record exists
        const checkResult = await query(
            'SELECT id FROM student_homework WHERE homework_id = $1 AND student_id = $2',
            [homeworkId, studentId]
        );

        if (checkResult.rows.length === 0) {
            // Create the record if it doesn't exist
            console.log('➕ Creating new student_homework record');
            await query(
                `INSERT INTO student_homework (homework_id, student_id, status, remarks)
                 VALUES ($1, $2, $3, $4)`,
                [homeworkId, studentId, status, remarks]
            );
        } else {
            // Update existing record
            console.log('✏️ Updating existing student_homework record');
            await query(
                `UPDATE student_homework 
                 SET status = $1, remarks = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE homework_id = $3 AND student_id = $4`,
                [status, remarks, homeworkId, studentId]
            );
        }

        console.log('✅ Homework status updated successfully');
        res.json({ success: true, message: 'Status updated' });
    } catch (error: any) {
        console.error('❌ Update status error:', error);
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

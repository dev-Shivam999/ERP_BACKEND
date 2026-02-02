import { Request, Response } from 'express';
import { query } from '../config';
import { successResponse, errorResponse } from '../utils';
import { sendNotificationToUser } from '../utils/notification.utils';
import { messaging } from '../config/firebase';
import { processAbsentNotifications } from '../utils/attendance.notification';

// Mark attendance for a class
export const markAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { classId, sectionId, date, attendance } = req.body;

        if (!userId) {
            errorResponse(res, 'User not authenticated', 401);
            return;
        }

        if (!classId || !sectionId || !date || !attendance || !Array.isArray(attendance)) {
            errorResponse(res, 'Invalid attendance data', 400);
            return;
        }

        // Transform attendance array to object for SP: { student_id: status }
        const attendanceMap = attendance.reduce((acc: any, curr: any) => {
            acc[curr.student_id] = curr.status;
            return acc;
        }, {});

        // Use stored procedure for bulk attendance
        const result = await query(
            `SELECT * FROM sp_mark_class_attendance($1, $2, $3, $4, $5)`,
            [classId, sectionId, date, JSON.stringify(attendanceMap), userId]
        );

        // Send notifications for absent students (asynchronously)
        const absentStudents = attendance.filter((a: any) => a.status === 'absent');
        if (absentStudents.length > 0) {
            processAbsentNotifications(absentStudents, date, userId).catch((err: any) =>
                console.error('Background notification process error:', err)
            );
        }

        successResponse(res, 'Attendance marked successfully', result.rows[0]);
    } catch (error) {
        console.error('Mark attendance error:', error);
        errorResponse(res, 'Failed to mark attendance', 500);
    }
};

// Get class attendance for a date
export const getClassAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId, sectionId, date } = req.params;
        const { stream } = req.query;

        let whereClause = "WHERE s.current_class_id = $1 AND s.section_id = $2 AND s.status = 'active'";
        const params: any[] = [classId, sectionId, date];

        if (stream) {
            whereClause += ' AND s.stream = $4';
            params.push(stream);
        }

        // Get all students in class with their attendance
        const result = await query(
            `SELECT s.id as student_id, s.admission_number, s.roll_number,
              up.first_name, up.last_name, up.photo_url,
              sa.status, sa.late_time, sa.remarks, sa.marked_at
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date = $3
       ${whereClause}
       ORDER BY s.roll_number`,
            params
        );

        const isMarked = result.rows.some(r => r.status !== null);

        successResponse(res, 'Class attendance fetched', {
            date,
            isMarked,
            students: result.rows,
        });
    } catch (error) {
        console.error('Get class attendance error:', error);
        errorResponse(res, 'Failed to fetch attendance', 500);
    }
};

// Get student attendance history
export const getStudentAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId } = req.params;
        const { month, year } = req.query;

        let whereClause = 'WHERE sa.student_id = $1';
        const params: any[] = [studentId];

        if (month && year) {
            whereClause += ` AND EXTRACT(MONTH FROM sa.date) = $2 AND EXTRACT(YEAR FROM sa.date) = $3`;
            params.push(month, year);
        }

        const result = await query(
            `SELECT sa.date, sa.status, sa.late_time, sa.remarks
       FROM student_attendance sa
       ${whereClause}
       ORDER BY sa.date DESC`,
            params
        );

        // Calculate statistics
        const stats = {
            total: result.rows.length,
            present: result.rows.filter(r => r.status === 'present').length,
            absent: result.rows.filter(r => r.status === 'absent').length,
            late: result.rows.filter(r => r.status === 'late').length,
            halfDay: result.rows.filter(r => r.status === 'half_day').length,
            percentage: 0,
        };
        stats.percentage = stats.total > 0 ? Math.round((stats.present / stats.total) * 100 * 100) / 100 : 0;

        successResponse(res, 'Student attendance fetched', {
            attendance: result.rows,
            statistics: stats,
        });
    } catch (error) {
        console.error('Get student attendance error:', error);
        errorResponse(res, 'Failed to fetch attendance', 500);
    }
};

// Get my attendance (for logged-in students)
export const getMyAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { month, year } = req.query;

        console.log('📅 getMyAttendance called for userId:', userId, 'month:', month, 'year:', year);

        // Get student record from userId
        const studentResult = await query(
            'SELECT id FROM students WHERE user_id = $1',
            [userId]
        );

        if (studentResult.rows.length === 0) {
            errorResponse(res, 'Student profile not found', 404);
            return;
        }

        const studentId = studentResult.rows[0].id;
        console.log('👤 Student ID:', studentId);

        let whereClause = 'WHERE sa.student_id = $1';
        const params: any[] = [studentId];

        if (month && year) {
            whereClause += ` AND EXTRACT(MONTH FROM sa.date) = $2 AND EXTRACT(YEAR FROM sa.date) = $3`;
            params.push(month, year);
        }

        const result = await query(
            `SELECT sa.date, sa.status, sa.late_time, sa.remarks
       FROM student_attendance sa
       ${whereClause}
       ORDER BY sa.date DESC`,
            params
        );

        console.log('✅ Found attendance records:', result.rows.length);

        // Calculate statistics
        const stats = {
            total: result.rows.length,
            present: result.rows.filter(r => r.status === 'present').length,
            absent: result.rows.filter(r => r.status === 'absent').length,
            late: result.rows.filter(r => r.status === 'late').length,
            halfDay: result.rows.filter(r => r.status === 'half_day').length,
            percentage: 0,
        };
        stats.percentage = stats.total > 0 ? Math.round((stats.present / stats.total) * 100 * 100) / 100 : 0;

        successResponse(res, 'Student attendance fetched', {
            attendance: result.rows,
            statistics: stats,
        });
    } catch (error) {
        console.error('❌ Get my attendance error:', error);
        errorResponse(res, 'Failed to fetch attendance', 500);
    }
};

// Get attendance summary for a date
export const getAttendanceSummary = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { date } = req.params;

        // Query directly instead of using view
        const result = await query(
            `SELECT c.id as class_id, c.name as class_name, sec.id as section_id, sec.name as section_name,
                COUNT(*) as total_students,
                COUNT(sa.id) as total_marked,
                COUNT(*) FILTER (WHERE sa.status = 'present') as present_count,
                COUNT(*) FILTER (WHERE sa.status = 'absent') as absent_count,
                COUNT(*) FILTER (WHERE sa.status = 'late') as late_count
             FROM students s
             JOIN users u ON s.user_id = u.id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date = $2
             WHERE u.school_id = $1 AND s.status = 'active'
             GROUP BY c.id, c.name, sec.id, sec.name
             ORDER BY c.numeric_value, sec.name`,
            [schoolId, date]
        );

        // Calculate totals
        const totals = result.rows.reduce(
            (acc, row) => ({
                totalStudents: acc.totalStudents + parseInt(row.total_marked || 0),
                present: acc.present + parseInt(row.present_count || 0),
                absent: acc.absent + parseInt(row.absent_count || 0),
                late: acc.late + parseInt(row.late_count || 0),
            }),
            { totalStudents: 0, present: 0, absent: 0, late: 0 }
        );

        successResponse(res, 'Attendance summary fetched', {
            date,
            classes: result.rows,
            totals: {
                ...totals,
                percentage: totals.totalStudents > 0 ? Math.round((totals.present / totals.totalStudents) * 100 * 100) / 100 : 0,
            },
        });
    } catch (error) {
        console.error('Get attendance summary error:', error);
        errorResponse(res, 'Failed to fetch summary', 500);
    }
};

// Get monthly attendance report
export const getMonthlyReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { month, year, classId } = req.query;

        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        let whereClause = `WHERE u.school_id = $1 
                       AND EXTRACT(MONTH FROM sa.date) = $2 
                       AND EXTRACT(YEAR FROM sa.date) = $3`;
        const params: any[] = [schoolId, m, y];

        if (classId) {
            whereClause += ` AND s.current_class_id = $4`;
            params.push(classId);
        }

        const result = await query(
            `SELECT s.id as student_id, s.admission_number, s.roll_number,
              up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
              c.name as class_name, sec.name as section_name,
              COUNT(*) FILTER (WHERE sa.status = 'present') as present_days,
              COUNT(*) FILTER (WHERE sa.status = 'absent') as absent_days,
              COUNT(*) FILTER (WHERE sa.status = 'late') as late_days,
              COUNT(*) as total_days,
              ROUND(COUNT(*) FILTER (WHERE sa.status = 'present')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as percentage
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_attendance sa ON s.id = sa.student_id
       ${whereClause}
       GROUP BY s.id, s.admission_number, s.roll_number, up.first_name, up.last_name, c.name, sec.name
       ORDER BY c.numeric_value, sec.name, s.roll_number`,
            params
        );

        successResponse(res, 'Monthly report fetched', {
            month: m,
            year: y,
            report: result.rows,
        });
    } catch (error) {
        console.error('Get monthly report error:', error);
        errorResponse(res, 'Failed to fetch report', 500);
    }
};

// Get teacher's assigned classes
export const getTeacherClasses = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const role = req.user?.role; // Assuming role is available in req.user

        let queryText = '';
        let queryParams: any[] = [];

        if (role === 'admin') {
            // Admin sees all classes
            queryText = `
                SELECT 
                    c.id as class_id, c.name as class_name,
                    s.id as section_id, s.name as section_name,
                    'All Subjects' as subject_name,
                    COUNT(st.id) as student_count
                FROM classes c
                JOIN sections s ON s.class_id = c.id
                LEFT JOIN students st ON st.current_class_id = c.id AND st.section_id = s.id AND st.status = 'active'
                WHERE c.school_id = $1
                GROUP BY c.id, c.name, s.id, s.name
                ORDER BY c.numeric_value, s.name`;
            queryParams = [schoolId];
        } else {
            // Teachers see assigned classes
            queryText = `
                SELECT DISTINCT 
                    c.id as class_id, c.name as class_name,
                    s.id as section_id, s.name as section_name,
                    sub.name as subject_name,
                    COUNT(st.id) as student_count
                FROM teacher_class_assignments tca
                JOIN classes c ON tca.class_id = c.id
                JOIN sections s ON tca.section_id = s.id
                JOIN subjects sub ON tca.subject_id = sub.id
                LEFT JOIN students st ON st.current_class_id = c.id AND st.section_id = s.id AND st.status = 'active'
                WHERE tca.teacher_id = (SELECT id FROM teachers WHERE user_id = $1)
                  AND c.school_id = $2
                GROUP BY c.id, c.name, s.id, s.name, sub.name
                ORDER BY c.numeric_value, s.name`;
            queryParams = [userId, schoolId];
        }

        const result = await query(queryText, queryParams);

        successResponse(res, 'Classes fetched successfully', result.rows);
    } catch (error) {
        console.error('Get classes error:', error);
        errorResponse(res, 'Failed to fetch classes', 500);
    }
};

// Update student roll number (teacher access)
export const updateStudentRollNumber = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId } = req.params;
        const { rollNumber } = req.body;
        const userId = req.user?.userId;

        // Check if teacher has access to this student's class
        const accessCheck = await query(
            `SELECT s.id 
             FROM students s
             JOIN teacher_class_assignments tca ON s.current_class_id = tca.class_id AND s.section_id = tca.section_id
             WHERE s.id = $1 AND tca.teacher_id = (SELECT id FROM teachers WHERE user_id = $2)`,
            [studentId, userId]
        );

        if (accessCheck.rows.length === 0) {
            errorResponse(res, 'Access denied. You can only update roll numbers for your assigned classes.', 403);
            return;
        }

        const result = await query(
            `UPDATE students SET roll_number = $1 WHERE id = $2 RETURNING *`,
            [rollNumber, studentId]
        );

        if (result.rowCount === 0) {
            errorResponse(res, 'Student not found', 404);
            return;
        }

        successResponse(res, 'Roll number updated successfully', result.rows[0]);
    } catch (error) {
        console.error('Update roll number error:', error);
        errorResponse(res, 'Failed to update roll number', 500);
    }
};

// Get students with low attendance
export const getLowAttendanceStudents = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { threshold = 75 } = req.query;

        const result = await query(
            `WITH attendance_calc AS (
         SELECT s.id as student_id, s.admission_number,
                up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                c.name as class_name, sec.name as section_name,
                pu.phone as parent_phone,
                COUNT(*) FILTER (WHERE sa.status = 'present') as present_days,
                COUNT(*) as total_days,
                ROUND(COUNT(*) FILTER (WHERE sa.status = 'present')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as percentage
         FROM students s
         JOIN users u ON s.user_id = u.id
         JOIN user_profiles up ON u.id = up.user_id
         JOIN classes c ON s.current_class_id = c.id
         JOIN sections sec ON s.section_id = sec.id
         LEFT JOIN student_attendance sa ON s.id = sa.student_id
         LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
         LEFT JOIN parents p ON sp.parent_id = p.id
         LEFT JOIN users pu ON p.user_id = pu.id
         WHERE u.school_id = $1 AND s.status = 'active'
         GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name, pu.phone
       )
       SELECT * FROM attendance_calc
       WHERE percentage < $2
       ORDER BY percentage ASC`,
            [schoolId, threshold]
        );

        successResponse(res, 'Low attendance students fetched', result.rows);
    } catch (error) {
        console.error('Get low attendance error:', error);
        errorResponse(res, 'Failed to fetch data', 500);
    }
};

/**
 * Background process to handle bulk absent notifications
 */


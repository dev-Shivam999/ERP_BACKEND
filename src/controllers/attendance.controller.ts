import { Request, Response } from 'express';
import { query } from '../config';
import { successResponse, errorResponse } from '../utils';

// Mark attendance for a class
export const markAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { classId, sectionId, date, attendance } = req.body;

        if (!classId || !sectionId || !date || !attendance || !Array.isArray(attendance)) {
            errorResponse(res, 'Invalid attendance data', 400);
            return;
        }

        // Use stored procedure for bulk attendance
        const result = await query(
            `SELECT * FROM sp_mark_class_attendance($1, $2, $3, $4, $5)`,
            [classId, sectionId, date, JSON.stringify(attendance), userId]
        );

        // Send notifications for absent students (in-app)
        const absentStudents = attendance.filter((a: any) => a.status === 'absent');

        if (absentStudents.length > 0) {
            // Create notifications for absent students' parents
            for (const absent of absentStudents) {
                await query(
                    `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
           SELECT u.school_id, 
                  'बच्चा आज Absent है / Child Absent Today',
                  'आपका बच्चा आज (' || $2 || ') स्कूल में अनुपस्थित है। Your child is absent from school today.',
                  'attendance', 'high', 'individual',
                  jsonb_build_array(p.user_id),
                  $3
           FROM students s
           JOIN users u ON s.user_id = u.id
           JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
           JOIN parents p ON sp.parent_id = p.id
           WHERE s.id = $1`,
                    [absent.student_id, date, userId]
                );
            }
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

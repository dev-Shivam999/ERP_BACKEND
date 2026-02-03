import { Request, Response } from 'express';
import { query } from '../config';
import { authenticate } from '../middleware';
import { successResponse, errorResponse } from '../utils';
import { getSchoolFeeSummary, getAllStudentsFeeTotals } from '../utils/feeUtils';

// 1. General Stats (Students, Teachers, Attendance Today, Certificates)
export const getGeneralStats = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const schoolId = req.user?.schoolId;
            if (!schoolId) { throw new Error('School ID not found'); }

            const today = new Date().toISOString().split('T')[0];

            const [attendanceResult, studentsResult, teachersResult, pendingCertificatesResult] = await Promise.all([
                query(
                    `SELECT 
                        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
                        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
                        COUNT(*) as total
                     FROM student_attendance sa
                     JOIN classes c ON sa.class_id = c.id
                     WHERE c.school_id = $1 AND sa.date = $2`,
                    [schoolId, today]
                ),
                query(
                    `SELECT COUNT(*) as total FROM students s JOIN users u ON s.user_id = u.id WHERE u.school_id = $1 AND s.status = 'active'`,
                    [schoolId]
                ),
                query(
                    `SELECT COUNT(*) as total FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true`,
                    [schoolId]
                ),
                // Pending Certificate Requests
                query(
                    `SELECT COUNT(*) as total FROM certificate_requests WHERE school_id = $1 AND status = 'pending'`,
                    [schoolId]
                )
            ]);

            const stats = {
                totalStudents: parseInt(studentsResult.rows[0]?.total || '0'),
                attendance: {
                    present: parseInt(attendanceResult.rows[0]?.present || '0'),
                    absent: parseInt(attendanceResult.rows[0]?.absent || '0'),
                    total: parseInt(attendanceResult.rows[0]?.total || '0'),
                },
                totalTeachers: parseInt(teachersResult.rows[0]?.total || '0'),
                pendingCertificates: parseInt(pendingCertificatesResult.rows[0]?.total || '0'),
            };

            successResponse(res, 'General stats fetched', stats);
        } catch (error) {
            console.error('General stats error:', error);
            errorResponse(res, 'Failed to fetch general stats', 500);
        }
    }
];

// 2. Financial Stats (Collections, Fees, Defaulters)
export const getFinancialStats = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const schoolId = req.user?.schoolId;
            if (!schoolId) { throw new Error('School ID not found'); }

            const today = new Date().toISOString().split('T')[0];

            // Run in parallel
            const [feeSummary, collectionResult, feeDefaultersResult] = await Promise.all([
                getSchoolFeeSummary(schoolId as string),
                query(
                    `SELECT 
                        COALESCE(SUM(fp.amount_paid), 0) as total,
                        COALESCE(SUM(CASE WHEN fp.payment_mode = 'cash' THEN fp.amount_paid ELSE 0 END), 0) as cash,
                        COALESCE(SUM(CASE WHEN fp.payment_mode IN ('upi', 'online') THEN fp.amount_paid ELSE 0 END), 0) as online,
                        COALESCE(SUM(CASE WHEN fp.payment_mode = 'cheque' THEN fp.amount_paid ELSE 0 END), 0) as cheque,
                        COUNT(*) as transactions
                     FROM fee_payments fp
                     JOIN student_fees sf ON fp.student_fee_id = sf.id
                     JOIN students s ON sf.student_id = s.id
                     JOIN users u ON s.user_id = u.id
                     WHERE u.school_id = $1 AND DATE(fp.payment_date) = $2`,
                    [schoolId, today]
                ),
                query(
                    `SELECT s.id, s.admission_number, up.first_name, up.last_name, c.name as class_name, sec.name as section_name,
                            (COALESCE(class_total.amt, 0) - COALESCE(paid.amt, 0)) as due_amount
                     FROM students s
                     JOIN users u ON s.user_id = u.id
                     JOIN user_profiles up ON u.id = up.user_id
                     JOIN classes c ON s.current_class_id = c.id
                     JOIN sections sec ON s.section_id = sec.id
                     LEFT JOIN (
                         SELECT class_id, SUM(amount) as amt 
                         FROM fee_structures 
                         WHERE academic_year_id = (SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1)
                         GROUP BY class_id
                     ) class_total ON s.current_class_id = class_total.class_id
                     LEFT JOIN (
                         SELECT student_id, SUM(amount_paid) as amt 
                         FROM student_fees 
                         GROUP BY student_id
                     ) paid ON s.id = paid.student_id
                     WHERE u.school_id = $1 AND s.status = 'active'
                       AND (COALESCE(class_total.amt, 0) - COALESCE(paid.amt, 0)) > 0
                     ORDER BY due_amount DESC
                     LIMIT 5`,
                    [schoolId]
                )
            ]);

            const stats = {
                todayCollection: {
                    total: feeSummary.todayCollection, // Use robust util
                    cash: parseFloat(collectionResult.rows[0]?.cash || '0'),
                    online: parseFloat(collectionResult.rows[0]?.online || '0'),
                    cheque: parseFloat(collectionResult.rows[0]?.cheque || '0'),
                    transactions: parseInt(collectionResult.rows[0]?.transactions || '0'),
                },
                yearlyCollection: feeSummary.yearlyCollection,
                pendingFees: feeSummary.totalPending,
                feeDefaulters: feeDefaultersResult.rows.map((d: any) => ({
                    id: d.id,
                    admissionNumber: d.admission_number,
                    name: `${d.first_name} ${d.last_name || ''}`.trim(),
                    class: `${d.class_name || ''} ${d.section_name || ''}`.trim(),
                    dueAmount: parseFloat(d.due_amount || '0'),
                })),
            };

            successResponse(res, 'Financial stats fetched', stats);
        } catch (error) {
            console.error('Financial stats error:', error);
            errorResponse(res, 'Failed to fetch financial stats', 500);
        }
    }
];

// 3. Analytics Stats (Charts, History)
export const getAnalyticsStats = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const schoolId = req.user?.schoolId;
            if (!schoolId) { throw new Error('School ID not found'); }

            const [recentAdmissionsResult, weeklyAttendanceResult, categoryStatsResult] = await Promise.all([
                query(
                    `SELECT s.id, s.admission_number, 
                        up.first_name, up.last_name,
                        c.name as class_name, sec.name as section_name,
                        s.created_at as admission_date
                 FROM students s
                 JOIN users u ON s.user_id = u.id
                 JOIN user_profiles up ON u.id = up.user_id
                 LEFT JOIN classes c ON s.current_class_id = c.id
                 LEFT JOIN sections sec ON s.section_id = sec.id
                 WHERE u.school_id = $1
                 ORDER BY s.created_at DESC
                 LIMIT 5`,
                    [schoolId]
                ),
                query(
                    `SELECT 
                        sa.date,
                        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
                        COUNT(*) as total
                     FROM student_attendance sa
                     JOIN classes c ON sa.class_id = c.id
                     WHERE c.school_id = $1 AND sa.date >= CURRENT_DATE - INTERVAL '6 days'
                     GROUP BY sa.date
                     ORDER BY sa.date ASC`,
                    [schoolId]
                ),
                query(
                    `SELECT 
                        COALESCE(s.category::TEXT, 'unspecified') as category,
                        COUNT(*) as value
                     FROM students s
                     JOIN users u ON s.user_id = u.id
                     WHERE u.school_id = $1 AND s.status = 'active'
                     GROUP BY s.category`,
                    [schoolId]
                )
            ]);

            const stats = {
                recentAdmissions: recentAdmissionsResult.rows.map((row: any) => ({
                    id: row.id,
                    admissionNumber: row.admission_number,
                    name: `${row.first_name} ${row.last_name || ''}`.trim(),
                    class: `${row.class_name || ''} ${row.section_name || ''}`.trim(),
                    date: row.admission_date,
                })),
                weeklyAttendance: weeklyAttendanceResult.rows.map((row: any) => ({
                    date: row.date,
                    day: new Date(row.date).toLocaleDateString('en-US', { weekday: 'short' }),
                    present: Math.round((parseInt(row.present) / parseInt(row.total)) * 100),
                })),
                categoryStats: categoryStatsResult.rows.map((row: any) => ({
                    name: row.category.charAt(0).toUpperCase() + row.category.slice(1),
                    value: parseInt(row.value),
                })),
            };

            successResponse(res, 'Analytics stats fetched', stats);
        } catch (error) {
            console.error('Analytics stats error:', error);
            errorResponse(res, 'Failed to fetch analytics stats', 500);
        }
    }
];

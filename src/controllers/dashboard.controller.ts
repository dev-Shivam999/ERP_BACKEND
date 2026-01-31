import { Request, Response } from 'express';
import { query } from '../config';
import { authenticate } from '../middleware';
import { successResponse, errorResponse } from '../utils';
import { getSchoolFeeSummary, getAllStudentsFeeTotals } from '../utils/feeUtils';

// Get dashboard statistics
export const getStats = [
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const schoolId = req.user?.schoolId;

            // Total students count (via users table)
            const studentsResult = await query(
                `SELECT COUNT(*) as total 
                 FROM students s
                 JOIN users u ON s.user_id = u.id
                 WHERE u.school_id = $1 AND s.status = 'active'`,
                [schoolId]
            );

            // Today's attendance
            const today = new Date().toISOString().split('T')[0];
            const attendanceResult = await query(
                `SELECT 
                    COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
                    COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
                    COUNT(*) as total
                 FROM student_attendance sa
                 JOIN classes c ON sa.class_id = c.id
                 WHERE c.school_id = $1 AND sa.date = $2`,
                [schoolId, today]
            );

            // Today's fee collection
            const collectionResult = await query(
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
            );

            // Total pending fees using centralized utility
            const feeSummary = await getSchoolFeeSummary(schoolId as string);

            // Fee defaulters using centralized utility (students with pending > 0)
            const allStudentsFees = await getAllStudentsFeeTotals(schoolId as string);
            const feeDefaulters = allStudentsFees
                .filter(s => s.totalPending > 0)
                .slice(0, 5)
                .map(s => ({
                    id: s.studentId,
                    admission_number: s.admissionNumber,
                    first_name: s.studentName.split(' ')[0],
                    last_name: s.studentName.split(' ').slice(1).join(' '),
                    class_name: s.className,
                    section_name: s.sectionName,
                    due_amount: s.totalPending,
                }));

            // Recent admissions (last 5)
            const recentAdmissionsResult = await query(
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
            );

            // Weekly attendance (last 7 days)
            const weeklyAttendanceResult = await query(
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
            );

            // Students by category
            const categoryStatsResult = await query(
                `SELECT 
                    COALESCE(s.category::TEXT, 'unspecified') as category,
                    COUNT(*) as value
                 FROM students s
                 JOIN users u ON s.user_id = u.id
                 WHERE u.school_id = $1 AND s.status = 'active'
                 GROUP BY s.category`,
                [schoolId]
            );

            // Teachers count
            const teachersResult = await query(
                `SELECT COUNT(*) as total FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true`,
                [schoolId]
            );

            // Pending Certificate Requests
            const pendingCertificatesResult = await query(
                `SELECT COUNT(*) as total FROM certificate_requests WHERE school_id = $1 AND status = 'pending'`,
                [schoolId]
            );

            const stats = {
                totalStudents: feeSummary.totalStudents,
                attendance: {
                    present: parseInt(attendanceResult.rows[0]?.present || '0'),
                    absent: parseInt(attendanceResult.rows[0]?.absent || '0'),
                    total: parseInt(attendanceResult.rows[0]?.total || '0'),
                },
                todayCollection: {
                    total: feeSummary.todayCollection,
                    cash: parseFloat(collectionResult.rows[0]?.cash || '0'),
                    online: parseFloat(collectionResult.rows[0]?.online || '0'),
                    cheque: parseFloat(collectionResult.rows[0]?.cheque || '0'),
                    transactions: parseInt(collectionResult.rows[0]?.transactions || '0'),
                },
                pendingFees: feeSummary.totalPending,
                yearlyCollection: feeSummary.yearlyCollection,
                totalTeachers: parseInt(teachersResult.rows[0]?.total || '0'),
                pendingCertificates: parseInt(pendingCertificatesResult.rows[0]?.total || '0'),
                recentAdmissions: recentAdmissionsResult.rows.map((row: any) => ({
                    id: row.id,
                    admissionNumber: row.admission_number,
                    name: `${row.first_name} ${row.last_name || ''}`.trim(),
                    class: `${row.class_name || ''} ${row.section_name || ''}`.trim(),
                    date: row.admission_date,
                })),
                feeDefaulters: feeDefaulters.map((d: any) => ({
                    id: d.id,
                    admissionNumber: d.admission_number,
                    name: `${d.first_name} ${d.last_name || ''}`.trim(),
                    class: `${d.class_name || ''} ${d.section_name || ''}`.trim(),
                    dueAmount: d.due_amount,
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

            successResponse(res, 'Dashboard stats fetched', stats);
        } catch (error) {
            console.error('Dashboard stats error:', error);
            errorResponse(res, 'Failed to fetch dashboard stats', 500);
        }
    },
];

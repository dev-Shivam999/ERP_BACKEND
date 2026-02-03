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
            // const studentsResult = await query(
            //     `SELECT COUNT(*) as total 
            //      FROM students s
            //      JOIN users u ON s.user_id = u.id
            //      WHERE u.school_id = $1 AND s.status = 'active'`,
            //     [schoolId]
            // );

            // Today's attendance
            const today = new Date().toISOString().split('T')[0];
            const [attendanceResult, collectionResult, feeSummary, recentAdmissionsResult, weeklyAttendanceResult, categoryStatsResult, teachersResult, pendingCertificatesResult] = await Promise.allSettled([query(
                `SELECT 
                    COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
                    COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
                    COUNT(*) as total
                 FROM student_attendance sa
                 JOIN classes c ON sa.class_id = c.id
                 WHERE c.school_id = $1 AND sa.date = $2`,
                [schoolId, today]
            ),

            // Today's fee collection
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
            getSchoolFeeSummary(schoolId as string),

            // Fee defaulters using centralized utility (students with pending > 0)
            // getAllStudentsFeeTotals(schoolId as string),



            // Recent admissions (last 5)
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
            // Weekly attendance (last 7 days)
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

            // Students by category
            query(
                `SELECT 
                    COALESCE(s.category::TEXT, 'unspecified') as category,
                    COUNT(*) as value
                 FROM students s
                 JOIN users u ON s.user_id = u.id
                 WHERE u.school_id = $1 AND s.status = 'active'
                 GROUP BY s.category`,
                [schoolId]
            ),

            // Teachers count
            query(
                `SELECT COUNT(*) as total FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true`,
                [schoolId]
            ),

            // Pending Certificate Requests
            query(
                `SELECT COUNT(*) as total FROM certificate_requests WHERE school_id = $1 AND status = 'pending'`,
                [schoolId]
            )]);
            const feeDefaulters = attendanceResult.status=="fulfilled"?attendanceResult.value.rows
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
                })):[]

            const stats = {
                totalStudents: feeSummary.status=="fulfilled"?feeSummary.value.totalStudents:0,
                attendance: {
                    present: parseInt(attendanceResult.status=="fulfilled"?attendanceResult.value.rows[0]?.present || '0':0),
                    absent: parseInt(attendanceResult.status=="fulfilled"?attendanceResult.value.rows[0]?.absent || '0':0),
                    total: parseInt(attendanceResult.status=="fulfilled"?attendanceResult.value.rows[0]?.total || '0':0),
                },
                todayCollection: {
                    total: feeSummary.status=="fulfilled"?feeSummary.value.todayCollection:0,
                    cash: parseFloat(collectionResult.status=="fulfilled"?collectionResult.value.rows[0]?.cash || '0':0),
                    online: parseFloat(collectionResult.status=="fulfilled"?collectionResult.value.rows[0]?.online || '0':0),
                    cheque: parseFloat(collectionResult.status=="fulfilled"?collectionResult.value.rows[0]?.cheque || '0':0),
                    transactions: parseInt(collectionResult.status=="fulfilled"?collectionResult.value.rows[0]?.transactions || '0':0),
                },
                pendingFees: feeSummary.status=="fulfilled"?feeSummary.value.totalPending:0,
                yearlyCollection: feeSummary.status=="fulfilled"?feeSummary.value.yearlyCollection:0,
                totalTeachers: parseInt(teachersResult.status=="fulfilled"?teachersResult.value.rows[0]?.total || '0':0),
                pendingCertificates: parseInt(pendingCertificatesResult.status=="fulfilled"?pendingCertificatesResult.value.rows[0]?.total || '0':0),
                recentAdmissions: recentAdmissionsResult.status=="fulfilled"?recentAdmissionsResult.value.rows.map((row: any) => ({
                    id: row.id,
                    admissionNumber: row.admission_number,
                    name: `${row.first_name} ${row.last_name || ''}`.trim(),
                    class: `${row.class_name || ''} ${row.section_name || ''}`.trim(),
                    date: row.admission_date,
                })):[],
                feeDefaulters: feeDefaulters.map((d: any) => ({
                    id: d.id,
                    admissionNumber: d.admission_number,
                    name: `${d.first_name} ${d.last_name || ''}`.trim(),
                    class: `${d.class_name || ''} ${d.section_name || ''}`.trim(),
                    dueAmount: d.due_amount,
                })),
                weeklyAttendance: weeklyAttendanceResult.status=="fulfilled"?weeklyAttendanceResult.value.rows.map((row: any) => ({
                    date: row.date,
                    day: new Date(row.date).toLocaleDateString('en-US', { weekday: 'short' }),
                    present: Math.round((parseInt(row.present) / parseInt(row.total)) * 100),
                })):[],
                categoryStats: categoryStatsResult.status=="fulfilled"?categoryStatsResult.value.rows.map((row: any) => ({
                    name: row.category.charAt(0).toUpperCase() + row.category.slice(1),
                    value: parseInt(row.value),
                })):[],
            };

            successResponse(res, 'Dashboard stats fetched', stats);
        } catch (error) {
            console.error('Dashboard stats error:', error);
            errorResponse(res, 'Failed to fetch dashboard stats', 500);
        }
    },
];

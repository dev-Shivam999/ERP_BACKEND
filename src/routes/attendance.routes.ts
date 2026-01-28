import { Router } from 'express';
import * as attendanceController from '../controllers/attendance.controller.js';
import { authenticate, teacherAccess, managementAccess, hasPermission } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/attendance/mark - Mark attendance for a class
router.post('/mark', hasPermission('mark_attendance'), attendanceController.markAttendance);

// GET /api/attendance/class/:classId/:sectionId/:date - Get class attendance for a date
router.get('/class/:classId/:sectionId/:date', hasPermission('mark_attendance'), attendanceController.getClassAttendance);

// GET /api/attendance/student/me - Get logged-in student's attendance
router.get('/student/me', attendanceController.getMyAttendance);

// GET /api/attendance/student/:studentId - Get student attendance history
router.get('/student/:studentId', teacherAccess, attendanceController.getStudentAttendance);

// GET /api/attendance/summary/:date - Get attendance summary for a date
router.get('/summary/:date', hasPermission('view_reports'), attendanceController.getAttendanceSummary);

// GET /api/attendance/report/monthly - Get monthly attendance report
router.get('/report/monthly', hasPermission('view_reports'), attendanceController.getMonthlyReport);

// GET /api/attendance/low-attendance - Get students with low attendance
router.get('/low-attendance', hasPermission('view_reports'), attendanceController.getLowAttendanceStudents);

export default router;

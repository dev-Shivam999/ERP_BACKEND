import { Router } from 'express';
import { authenticate, teacherAccess } from '../middleware';
import {
    getAllTeachers,
    getTeacherById,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    getTeacherClasses,
    updateStudentRollNumber,
    getTeacherDashboardStats,
    getTeacherProfile
} from '../controllers/teacher.controller';

const router = Router();

router.use(authenticate);

// Teacher-specific routes
router.get('/me/dashboard', teacherAccess, getTeacherDashboardStats);
router.get('/me/profile', teacherAccess, getTeacherProfile);
router.get('/me/classes', teacherAccess, getTeacherClasses);
router.put('/students/:studentId/roll-number', teacherAccess, updateStudentRollNumber);

// Admin routes
router.get('/', getAllTeachers);
router.get('/:id', getTeacherById);
router.post('/', createTeacher);
router.put('/:id', updateTeacher);
router.delete('/:id', deleteTeacher);

export default router;

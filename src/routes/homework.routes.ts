import { Router } from 'express';
import * as homeworkController from '../controllers/homework.controller';
import { authenticate, teacherAccess, studentAccess } from '../middleware';

const router = Router();

router.use(authenticate);

// Teacher Routes
router.post('/create', teacherAccess, homeworkController.createHomework);
router.get('/status/:homeworkId', teacherAccess, homeworkController.getHomeworkStatus);
router.post('/update-status', teacherAccess, homeworkController.updateHomeworkStatus);

// Student Routes
router.get('/me', homeworkController.getMyHomework); // New: Get homework for logged-in user
router.get('/student/:studentId', studentAccess, homeworkController.getStudentHomework);

// Shared/Public Routes (authenticated)
router.get('/class/:classId/:sectionId', homeworkController.getHomeworkByClass);
router.get('/subjects/:classId', homeworkController.getSubjectsByClass);

export default router;

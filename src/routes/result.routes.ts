import { Router } from 'express';
import { authenticate, adminOnly, managementAccess, studentAccess, studentOrParentAccess } from '../middleware';
import * as resultController from '../controllers/result.controller';

const router = Router();

router.use(authenticate);

// Admin/Management routes
router.get('/sessions', managementAccess, resultController.getAllResultSessions);
router.post('/sessions', managementAccess, resultController.createResultSession);
router.get('/sessions/:sessionId/students', managementAccess, resultController.getStudentsForMarkEntry);
router.get('/sessions/:sessionId/subjects', managementAccess, resultController.getSubjectsForExamSession);
router.get('/classes/:classId/subjects', managementAccess, resultController.getSubjectsForClass);
router.post('/sessions/:sessionId/students/:studentId/marks', managementAccess, resultController.enterStudentMarks);
router.get('/sessions/:sessionId/students/:studentId/marks', managementAccess, resultController.getStudentMarks);
router.get('/sessions/:sessionId/results', managementAccess, resultController.getClassResults);
router.post('/sessions/:sessionId/publish', managementAccess, resultController.publishResults);
router.get('/sessions/:sessionId/statistics', managementAccess, resultController.getResultStatistics);

// Student/Parent routes
router.get('/my-results', studentOrParentAccess, resultController.getMyResults);
router.get('/sessions/:sessionId/students/:studentId/result', studentOrParentAccess, resultController.getStudentResult);

export default router;
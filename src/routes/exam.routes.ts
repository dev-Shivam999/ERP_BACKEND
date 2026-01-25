import { Router } from 'express';
import { authenticate, hasPermission, adminOnly } from '../middleware';
import {
    getAllExams,
    createExam,
    getExamSchedule,
    getExamResults,
    saveMarks,
    publishResults,
    getExamStats,
    getExamById,
    updateExam,
    deleteExam
} from '../controllers/exam.controller';

const router = Router();

router.use(authenticate);

router.get('/', hasPermission('manage_exams'), getAllExams);
router.post('/', hasPermission('manage_exams'), createExam);
router.get('/:id', hasPermission('manage_exams'), getExamById);
router.put('/:id', hasPermission('manage_exams'), updateExam);
router.delete('/:id', adminOnly, deleteExam);
router.get('/:examId/schedule', hasPermission('manage_exams'), getExamSchedule);
router.get('/:examId/results', hasPermission('manage_exams'), getExamResults);
router.get('/:examId/stats', hasPermission('view_reports'), getExamStats);
router.post('/marks', hasPermission('manage_exams'), saveMarks);
router.post('/:examId/publish', adminOnly, publishResults);

export default router;

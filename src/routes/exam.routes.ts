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
    deleteExam,
    getActiveExams,
    generateAdmitCards,
    issueAdmitCard,
    getAdmitCard,
    getExamStudentsStatus,
    getBatchAdmitCards
} from '../controllers/exam.controller';

const router = Router();

router.use(authenticate);

router.get('/active', getActiveExams);
router.get('/', hasPermission('manage_exams'), getAllExams);
router.post('/', hasPermission('manage_exams'), createExam);
// Admit Cards
// Admit Cards
router.post('/:id/admit-cards/generate', hasPermission('manage_exams'), generateAdmitCards);
router.post('/:id/admit-cards/issue', hasPermission('manage_exams'), issueAdmitCard);
router.get('/:id/admit-card-status', hasPermission('manage_exams'), getExamStudentsStatus);
router.get('/:id/admit-cards/batch', hasPermission('manage_exams'), getBatchAdmitCards);
router.get('/:id/admit-card', authenticate, getAdmitCard);

router.get('/:id', hasPermission('manage_exams'), getExamById);
router.put('/:id', hasPermission('manage_exams'), updateExam);
router.delete('/:id', adminOnly, deleteExam);
router.get('/:examId/schedule', hasPermission('manage_exams'), getExamSchedule);
router.get('/:examId/results', hasPermission('manage_exams'), getExamResults);
router.get('/:examId/stats', hasPermission('view_reports'), getExamStats);
router.post('/marks', hasPermission('manage_exams'), saveMarks);
router.post('/:examId/publish', adminOnly, publishResults);

export default router;

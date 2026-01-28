import { Router } from 'express';
import * as studentController from '../controllers/student.controller.js';
import { authenticate, adminOnly, managementAccess, teacherAccess, hasPermission } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/students - List all students (with filters)
router.get('/', teacherAccess, studentController.getAllStudents);

// GET /api/students/me - Get logged-in student profile
router.get('/me', studentController.getStudentProfile);

// GET /api/students/me/teachers - Get student's teachers
router.get('/me/teachers', studentController.getStudentTeachers);

// GET /api/students/:id - Get student by ID
router.get('/:id', teacherAccess, studentController.getStudentById);

// POST /api/students - Create new student
router.post('/', hasPermission('manage_students'), studentController.createStudent);

// PUT /api/students/:id - Update student
router.put('/:id', hasPermission('manage_students'), studentController.updateStudent);

// DELETE /api/students/:id - Delete student
router.delete('/:id', hasPermission('manage_students'), studentController.deleteStudent);

// POST /api/students/promote - Promote students to next class
router.post('/promote', adminOnly, studentController.promoteStudents);

// GET /api/students/:id/documents - Get student documents
router.get('/:id/documents', teacherAccess, studentController.getStudentDocuments);

// POST /api/students/:id/documents - Upload student document
router.post('/:id/documents', hasPermission('manage_students'), studentController.uploadDocument);

export default router;

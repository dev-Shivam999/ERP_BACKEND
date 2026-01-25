import { Router } from 'express';
import * as academicController from '../controllers/academic.controller.js';
import { authenticate, managementAccess } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/academic/classes - Get all classes
router.get('/classes', academicController.getAllClasses);

// POST /api/academic/classes - Create new class
router.post('/classes', managementAccess, academicController.createClass);

// PUT /api/academic/classes/:id - Update class
router.put('/classes/:id', managementAccess, academicController.updateClass);

// DELETE /api/academic/classes/:id - Delete class
router.delete('/classes/:id', managementAccess, academicController.deleteClass);

// GET /api/academic/sections/:classId - Get sections for a class
router.get('/sections/:classId', academicController.getSectionsByClass);

// POST /api/academic/sections - Create new section
router.post('/sections', managementAccess, academicController.createSection);

export default router;

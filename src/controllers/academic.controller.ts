import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';

// Get all classes
export const getAllClasses = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT * FROM classes WHERE school_id = $1 ORDER BY numeric_value, name`,
            [schoolId]
        );

        successResponse(res, 'Classes fetched successfully', result.rows);
    } catch (error) {
        console.error('Get classes error:', error);
        errorResponse(res, 'Failed to fetch classes', 500);
    }
};

// Create new class
export const createClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { name, numericValue, displayOrder } = req.body;

        const result = await query(
            `INSERT INTO classes (school_id, name, numeric_value, display_order)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [schoolId, name, numericValue, displayOrder || numericValue]
        );

        successResponse(res, 'Class created successfully', result.rows[0], 201);
    } catch (error) {
        console.error('Create class error:', error);
        errorResponse(res, 'Failed to create class', 500);
    }
};

// Update class
export const updateClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const schoolId = req.user?.schoolId;
        const { name, numericValue, displayOrder } = req.body;

        const result = await query(
            `UPDATE classes 
             SET name = $1, numeric_value = $2, display_order = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND school_id = $5
             RETURNING *`,
            [name, numericValue, displayOrder || numericValue, id, schoolId]
        );

        if (result.rowCount === 0) {
            errorResponse(res, 'Class not found', 404);
            return;
        }

        successResponse(res, 'Class updated successfully', result.rows[0]);
    } catch (error) {
        console.error('Update class error:', error);
        errorResponse(res, 'Failed to update class', 500);
    }
};

// Delete class
export const deleteClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const schoolId = req.user?.schoolId;

        // Check if class is in use (e.g., by students, exams, or promotions)
        const checkResult = await query(
            `SELECT id FROM students WHERE current_class_id = $1 OR admission_class_id = $1
             UNION ALL
             SELECT id FROM exam_schedules WHERE class_id = $1
             UNION ALL
             SELECT id FROM student_promotions WHERE from_class_id = $1 OR to_class_id = $1
             LIMIT 1`,
            [id]
        );

        if (checkResult.rows.length > 0) {
            errorResponse(res, 'Cannot delete class: it is still referenced by students, exams, or promotion records.', 400);
            return;
        }

        const result = await query(
            `DELETE FROM classes WHERE id = $1 AND school_id = $2`,
            [id, schoolId]
        );

        if (result.rowCount === 0) {
            errorResponse(res, 'Class not found', 404);
            return;
        }

        successResponse(res, 'Class deleted successfully');
    } catch (error) {
        console.error('Delete class error:', error);
        errorResponse(res, 'Failed to delete class', 500);
    }
};

// Get sections for a class
export const getSectionsByClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId } = req.params;

        const result = await query(
            `SELECT * FROM sections WHERE class_id = $1 ORDER BY name`,
            [classId]
        );

        successResponse(res, 'Sections fetched successfully', result.rows);
    } catch (error) {
        console.error('Get sections error:', error);
        errorResponse(res, 'Failed to fetch sections', 500);
    }
};

// Create new section
export const createSection = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classId, name, capacity } = req.body;

        const result = await query(
            `INSERT INTO sections (class_id, name, capacity)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [classId, name, capacity || 40]
        );

        successResponse(res, 'Section created successfully', result.rows[0], 201);
    } catch (error) {
        console.error('Create section error:', error);
        errorResponse(res, 'Failed to create section', 500);
    }
};

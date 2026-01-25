import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';

// Get all installment plans for a school
export const getInstallmentPlans = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT p.*, 
                    (SELECT json_agg(d ORDER BY d.installment_no) 
                     FROM fee_installment_details d 
                     WHERE d.plan_id = p.id) as details
             FROM fee_installment_plans p
             WHERE p.school_id = $1
             ORDER BY p.name ASC`,
            [schoolId]
        );

        successResponse(res, 'Installment plans fetched successfully', result.rows);
    } catch (error) {
        console.error('Get installment plans error:', error);
        errorResponse(res, 'Failed to fetch installment plans', 500);
    }
};

// Create a new installment plan
export const createInstallmentPlan = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { name, description, details } = req.body;

        if (!name || !details || !Array.isArray(details) || details.length === 0) {
            errorResponse(res, 'Name and installment details are required', 400);
            return;
        }

        const result = await transaction(async (client) => {
            // Check if name already exists
            const existing = await client.query(
                'SELECT id FROM fee_installment_plans WHERE school_id = $1 AND name = $2',
                [schoolId, name]
            );

            if (existing.rows.length > 0) {
                throw new Error('An installment plan with this name already exists');
            }

            // Create plan
            const planResult = await client.query(
                `INSERT INTO fee_installment_plans (school_id, name, description)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [schoolId, name, description]
            );

            const plan = planResult.rows[0];

            // Create details
            for (const detail of details) {
                await client.query(
                    `INSERT INTO fee_installment_details (plan_id, installment_no, percentage, due_month, due_day)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [plan.id, detail.installment_no, detail.percentage, detail.due_month, detail.due_day || 10]
                );
            }

            return plan;
        });

        successResponse(res, 'Installment plan created successfully', result, 201);
    } catch (error: any) {
        console.error('Create installment plan error:', error);
        errorResponse(res, error.message || 'Failed to create installment plan', 500);
    }
};

// Update an existing installment plan
export const updateInstallmentPlan = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { id } = req.params;
        const { name, description, details } = req.body;

        await transaction(async (client) => {
            // Verify ownership
            const planCheck = await client.query(
                'SELECT id FROM fee_installment_plans WHERE id = $1 AND school_id = $2',
                [id, schoolId]
            );

            if (planCheck.rows.length === 0) {
                throw new Error('Installment plan not found');
            }

            // Update plan
            await client.query(
                `UPDATE fee_installment_plans SET name = $1, description = $2 WHERE id = $3`,
                [name, description, id]
            );

            if (details && Array.isArray(details)) {
                // Delete existing details and recreate
                await client.query('DELETE FROM fee_installment_details WHERE plan_id = $1', [id]);

                for (const detail of details) {
                    await client.query(
                        `INSERT INTO fee_installment_details (plan_id, installment_no, percentage, due_month, due_day)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [id, detail.installment_no, detail.percentage, detail.due_month, detail.due_day || 10]
                    );
                }
            }
        });

        successResponse(res, 'Installment plan updated successfully');
    } catch (error: any) {
        console.error('Update installment plan error:', error);
        errorResponse(res, error.message || 'Failed to update installment plan', 500);
    }
};

// Delete an installment plan
export const deleteInstallmentPlan = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const schoolId = req.user?.schoolId;

        await transaction(async (client) => {
            // Check if plan is in use by any student
            const studentCheck = await client.query(
                'SELECT id FROM students WHERE installment_plan_id = $1 LIMIT 1',
                [id]
            );

            if (studentCheck.rows.length > 0) {
                throw new Error('Cannot delete plan because it is assigned to students');
            }

            // Delete plan (details will be deleted via ON DELETE CASCADE if configured, 
            // but we added CASCADE in the table definition)
            const result = await client.query(
                'DELETE FROM fee_installment_plans WHERE id = $1 AND school_id = $2',
                [id, schoolId]
            );

            if (result.rowCount === 0) {
                throw new Error('Installment plan not found or not owned by your school');
            }
        });

        successResponse(res, 'Installment plan deleted successfully');
    } catch (error: any) {
        console.error('Delete installment plan error:', error);
        errorResponse(res, error.message || 'Failed to delete installment plan', 500);
    }
};

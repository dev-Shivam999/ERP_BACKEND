import { Request, Response } from 'express';
import { query } from '../config/database';
import { successResponse, errorResponse } from '../utils';

// Get my salary history (Teacher)
export const getMySalaryHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        // Get teacher id
        const teacherResult = await query('SELECT id FROM teachers WHERE user_id = $1', [userId]);
        if (teacherResult.rows.length === 0) {
            errorResponse(res, 'Teacher profile not found', 404);
            return;
        }
        const teacherId = teacherResult.rows[0].id;

        const result = await query(
            `SELECT * FROM payroll 
             WHERE teacher_id = $1 
             ORDER BY year DESC, month DESC`,
            [teacherId]
        );

        successResponse(res, 'Salary history fetched successfully', result.rows);
    } catch (error) {
        console.error('Get salary history error:', error);
        errorResponse(res, 'Failed to fetch salary history', 500);
    }
};

// Admin: Get all payroll for a specific month
export const getPayrollByMonth = async (req: Request, res: Response): Promise<void> => {
    try {
        const { month, year } = req.query;
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT t.id as teacher_id, t.employee_id, up.first_name, up.last_name, t.designation,
                    p.id as payroll_id, p.basic_salary, p.allowances, p.deductions, p.net_salary, p.status, p.payment_date
             FROM teachers t
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             LEFT JOIN payroll p ON t.id = p.teacher_id AND p.month = $1 AND p.year = $2
             WHERE u.school_id = $3
             ORDER BY up.first_name`,
            [month, year, schoolId]
        );

        successResponse(res, 'Payroll fetched successfully', result.rows);
    } catch (error) {
        console.error('Get payroll error:', error);
        errorResponse(res, 'Failed to fetch payroll', 500);
    }
};

// Admin: Process/Update Payroll
export const processPayroll = async (req: Request, res: Response): Promise<void> => {
    try {
        const { teacherId, month, year, basicSalary, allowances, deductions, status, paymentDate } = req.body;
        const schoolId = req.user?.schoolId;

        const basic = parseFloat(basicSalary) || 0;
        const allow = parseFloat(allowances) || 0;
        const deduct = parseFloat(deductions) || 0;
        const netSalary = basic + allow - deduct;

        const result = await query(
            `INSERT INTO payroll (school_id, teacher_id, month, year, basic_salary, allowances, deductions, net_salary, status, payment_date, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (teacher_id, month, year) 
             DO UPDATE SET 
                basic_salary = $5,
                allowances = $6,
                deductions = $7,
                net_salary = $8,
                status = $9,
                payment_date = $10,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [schoolId, teacherId, month, year, basic, allow, deduct, netSalary, status || 'pending', paymentDate || null]
        );

        successResponse(res, 'Payroll processed successfully', { id: result.rows[0].id });
    } catch (error) {
        console.error('Process payroll error:', error);
        errorResponse(res, 'Failed to process payroll', 500);
    }
};

import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';

// Request a certificate (Student)
export const requestCertificate = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const { certificateType, reason } = req.body;

        // Get student ID
        const studentRes = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
        if (studentRes.rows.length === 0) {
            errorResponse(res, 'Student record not found', 404);
            return;
        }
        const studentId = studentRes.rows[0].id;

        const result = await query(
            `INSERT INTO certificate_requests (school_id, student_id, certificate_type, reason, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING *`,
            [schoolId, studentId, certificateType, reason]
        );

        successResponse(res, 'Certificate request submitted successfully', result.rows[0]);
    } catch (error) {
        console.error('Request certificate error:', error);
        errorResponse(res, 'Failed to submit certificate request', 500);
    }
};

// Get all requests for a student
export const getStudentRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const studentRes = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
        if (studentRes.rows.length === 0) {
            errorResponse(res, 'Student record not found', 404);
            return;
        }
        const studentId = studentRes.rows[0].id;

        const result = await query(
            `SELECT * FROM certificate_requests 
             WHERE student_id = $1 
             ORDER BY created_at DESC`,
            [studentId]
        );

        successResponse(res, 'Certificate requests fetched', result.rows);
    } catch (error) {
        console.error('Get student requests error:', error);
        errorResponse(res, 'Failed to fetch certificate requests', 500);
    }
};

// Get all pending requests (Admin)
export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT cr.*, up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    s.admission_number, c.name as class_name, sec.name as section_name
             FROM certificate_requests cr
             JOIN students s ON cr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             WHERE cr.school_id = $1 AND cr.status = 'pending'
             ORDER BY cr.created_at ASC`,
            [schoolId]
        );

        successResponse(res, 'Pending certificate requests fetched', result.rows);
    } catch (error) {
        console.error('Get pending requests error:', error);
        errorResponse(res, 'Failed to fetch pending requests', 500);
    }
};

// Get today's requests (Admin)
export const getTodayRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT cr.*, up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    s.admission_number, c.name as class_name, sec.name as section_name
             FROM certificate_requests cr
             JOIN students s ON cr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             WHERE cr.school_id = $1 AND cr.created_at::date = CURRENT_DATE
             ORDER BY cr.created_at DESC`,
            [schoolId]
        );

        successResponse(res, "Today's certificate requests fetched", result.rows);
    } catch (error) {
        console.error('Get today requests error:', error);
        errorResponse(res, "Failed to fetch today's requests", 500);
    }
};

// Update request status (Admin - Accept/Reject)
export const updateRequestStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { status, adminRemarks } = req.body;

        const result = await query(
            `UPDATE certificate_requests 
             SET status = $1, admin_remarks = $2, 
                 accepted_at = CASE WHEN $1 = 'accepted' THEN CURRENT_TIMESTAMP ELSE accepted_at END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 RETURNING *`,
            [status, adminRemarks, id]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Certificate request not found', 404);
            return;
        }

        successResponse(res, `Certificate request ${status}`, result.rows[0]);
    } catch (error) {
        console.error('Update request status error:', error);
        errorResponse(res, 'Failed to update certificate request status', 500);
    }
};

// Delete request
export const deleteRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query(`DELETE FROM certificate_requests WHERE id = $1 RETURNING *`, [id]);

        if (result.rows.length === 0) {
            errorResponse(res, 'Certificate request not found', 404);
            return;
        }

        successResponse(res, 'Certificate request deleted successfully');
    } catch (error) {
        console.error('Delete request error:', error);
        errorResponse(res, 'Failed to delete certificate request', 500);
    }
};

// Get specific certificate data for generation
export const getCertificateData = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT cr.*, up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    up.date_of_birth, up.address,
                    s.admission_number, s.admission_date,
                    c.name as class_name, sec.name as section_name,
                    sch.name as school_name, sch.address as school_address, sch.phone as school_phone, 
                    sch.email as school_email, sch.website as school_website, sch.logo_url as school_logo,
                    ay.name as academic_year,
                    (SELECT up2.first_name || ' ' || COALESCE(up2.last_name, '') 
                     FROM parents p 
                     JOIN student_parents sp ON p.id = sp.parent_id
                     JOIN users u2 ON p.user_id = u2.id
                     JOIN user_profiles up2 ON u2.id = up2.user_id
                     WHERE sp.student_id = s.id AND sp.relationship = 'father' LIMIT 1) as father_name,
                    (SELECT up2.first_name || ' ' || COALESCE(up2.last_name, '') 
                     FROM parents p 
                     JOIN student_parents sp ON p.id = sp.parent_id
                     JOIN users u2 ON p.user_id = u2.id
                     JOIN user_profiles up2 ON u2.id = up2.user_id
                     WHERE sp.student_id = s.id AND sp.relationship = 'mother' LIMIT 1) as mother_name
             FROM certificate_requests cr
             JOIN students s ON cr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             JOIN schools sch ON cr.school_id = sch.id
             LEFT JOIN academic_years ay ON ay.school_id = sch.id AND ay.is_current = true
             WHERE cr.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Certificate request not found', 404);
            return;
        }

        successResponse(res, 'Certificate data fetched', result.rows[0]);
    } catch (error) {
        console.error('Get certificate data error:', error);
        errorResponse(res, 'Failed to fetch certificate data', 500);
    }
};

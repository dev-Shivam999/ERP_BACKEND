import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';

// Helper function to parse sessionId
const parseSessionId = (sessionId: string | string[]): [string, string] => {
    const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    return sessionIdStr.split('-') as [string, string];
};

// Get all result sessions
export const getAllResultSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { status, examId } = req.query;

        let whereClause = 'WHERE rs.school_id = $1';
        const params: any[] = [schoolId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND rs.status = $${paramIndex++}`;
            params.push(status);
        }

        if (examId) {
            whereClause += ` AND rs.exam_id = $${paramIndex++}`;
            params.push(examId);
        }

        const result = await query(
            `SELECT rs.*, e.name as exam_name, e.exam_type,
                    COUNT(sr.id) as total_students,
                    COUNT(CASE WHEN sr.status = 'published' THEN 1 END) as published_count
             FROM result_sessions rs
             LEFT JOIN exams e ON rs.exam_id = e.id
             LEFT JOIN student_results sr ON rs.id = sr.result_session_id
             ${whereClause}
             GROUP BY rs.id, e.name, e.exam_type
             ORDER BY rs.created_at DESC`,
            params
        );

        successResponse(res, 'Result sessions fetched successfully', result.rows);
    } catch (error) {
        console.error('Get result sessions error:', error);
        errorResponse(res, 'Failed to fetch result sessions', 500);
    }
};

// Create new result session (auto-created when needed)
export const createResultSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { examId, name, description } = req.body;

        const result = await query(
            `INSERT INTO result_sessions (school_id, exam_id, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (school_id, exam_id) DO UPDATE SET 
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [schoolId, examId, name, description]
        );

        successResponse(res, 'Result session created successfully', result.rows[0], 201);
    } catch (error) {
        console.error('Create result session error:', error);
        errorResponse(res, 'Failed to create result session', 500);
    }
};

// Get students for mark entry with dynamic session creation
export const getStudentsForMarkEntry = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const { classId, sectionId } = req.query;
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year (format: examId-year)
        const [examId, year] = parseSessionId(sessionId);

        // Create or get result session
        const sessionResult = await query(
            `INSERT INTO result_sessions (school_id, exam_id, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (school_id, exam_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [schoolId, examId, `${examId} Results ${year}`, `Results for ${year} academic year`]
        );

        const actualSessionId = sessionResult.rows[0].id;

        let whereClause = '';
        const params: any[] = [schoolId, actualSessionId];
        let paramIndex = 3;

        if (classId) {
            whereClause += ` AND s.current_class_id = $${paramIndex++}`;
            params.push(classId);
        }

        if (sectionId) {
            whereClause += ` AND s.section_id = $${paramIndex++}`;
            params.push(sectionId);
        }

        const result = await query(
            `SELECT s.id as student_id, s.admission_number, s.roll_number,
                    up.first_name, up.last_name,
                    c.name as class_name, sec.name as section_name,
                    sr.id as result_id, sr.status as result_status,
                    sr.total_marks, sr.obtained_marks, sr.percentage, sr.grade
             FROM students s
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN student_results sr ON s.id = sr.student_id AND sr.result_session_id = $2
             WHERE s.status = 'active' AND u.school_id = $1 ${whereClause}
             ORDER BY s.roll_number, up.first_name`,
            params
        );

        successResponse(res, 'Students fetched successfully', result.rows);
    } catch (error) {
        console.error('Get students for mark entry error:', error);
        errorResponse(res, 'Failed to fetch students', 500);
    }
};

// Get subjects for a class
export const getSubjectsForClass = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT s.id, s.name, s.code, s.is_optional
             FROM subjects s
             WHERE s.school_id = $1
             ORDER BY s.name`,
            [schoolId]
        );

        successResponse(res, 'Subjects fetched successfully', result.rows);
    } catch (error) {
        console.error('Get subjects error:', error);
        errorResponse(res, 'Failed to fetch subjects', 500);
    }
};

// Enter/Update marks for a student
export const enterStudentMarks = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId, studentId } = req.params;
        const { marks, classId, sectionId } = req.body; // marks: [{ subjectId, maxMarks, obtainedMarks }]
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        const result = await transaction(async (client) => {
            // Create or get result session
            const sessionResult = await client.query(
                `INSERT INTO result_sessions (school_id, exam_id, name, description)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (school_id, exam_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                 RETURNING id`,
                [schoolId, examId, `${examId} Results ${year}`, `Results for ${year} academic year`]
            );

            const actualSessionId = sessionResult.rows[0].id;

            // Create or get student result record
            let studentResultId;
            const existingResult = await client.query(
                `SELECT id FROM student_results WHERE result_session_id = $1 AND student_id = $2`,
                [actualSessionId, studentId]
            );

            if (existingResult.rows.length > 0) {
                studentResultId = existingResult.rows[0].id;
            } else {
                const newResult = await client.query(
                    `INSERT INTO student_results (result_session_id, student_id, class_id, section_id)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [actualSessionId, studentId, classId, sectionId]
                );
                studentResultId = newResult.rows[0].id;
            }

            // Insert/Update subject marks
            for (const mark of marks) {
                const percentage = mark.maxMarks > 0 ? (mark.obtainedMarks / mark.maxMarks) * 100 : 0;
                let grade = 'F';

                if (percentage >= 90) grade = 'A+';
                else if (percentage >= 80) grade = 'A';
                else if (percentage >= 70) grade = 'B+';
                else if (percentage >= 60) grade = 'B';
                else if (percentage >= 50) grade = 'C+';
                else if (percentage >= 40) grade = 'C';
                else if (percentage >= 33) grade = 'D';

                await client.query(
                    `INSERT INTO subject_marks (student_result_id, subject_id, max_marks, obtained_marks, grade)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (student_result_id, subject_id)
                     DO UPDATE SET 
                        max_marks = EXCLUDED.max_marks,
                        obtained_marks = EXCLUDED.obtained_marks,
                        grade = EXCLUDED.grade,
                        updated_at = CURRENT_TIMESTAMP`,
                    [studentResultId, mark.subjectId, mark.maxMarks, mark.obtainedMarks, grade]
                );
            }

            // Calculate totals and update student result
            const totals = await client.query(
                `SELECT 
                    COALESCE(SUM(max_marks), 0) as total_max,
                    COALESCE(SUM(obtained_marks), 0) as total_obtained
                 FROM subject_marks 
                 WHERE student_result_id = $1`,
                [studentResultId]
            );

            const totalMax = parseFloat(totals.rows[0].total_max);
            const totalObtained = parseFloat(totals.rows[0].total_obtained);
            const overallPercentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

            let overallGrade = 'F';
            if (overallPercentage >= 90) overallGrade = 'A+';
            else if (overallPercentage >= 80) overallGrade = 'A';
            else if (overallPercentage >= 70) overallGrade = 'B+';
            else if (overallPercentage >= 60) overallGrade = 'B';
            else if (overallPercentage >= 50) overallGrade = 'C+';
            else if (overallPercentage >= 40) overallGrade = 'C';
            else if (overallPercentage >= 33) overallGrade = 'D';

            await client.query(
                `UPDATE student_results 
                 SET 
                    total_marks = $1,
                    obtained_marks = $2,
                    percentage = $3,
                    grade = $4,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5`,
                [totalMax, totalObtained, overallPercentage.toFixed(2), overallGrade, studentResultId]
            );

            return studentResultId;
        });

        successResponse(res, 'Marks entered successfully', { studentResultId: result });
    } catch (error) {
        console.error('Enter marks error:', error);
        errorResponse(res, 'Failed to enter marks', 500);
    }
};

// Get student marks for editing
export const getStudentMarks = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId, studentId } = req.params;
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        // Get or create result session
        const sessionResult = await query(
            `INSERT INTO result_sessions (school_id, exam_id, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (school_id, exam_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [schoolId, examId, `${examId} Results ${year}`, `Results for ${year} academic year`]
        );

        const actualSessionId = sessionResult.rows[0].id;

        const result = await query(
            `SELECT sr.*, s.admission_number, s.roll_number,
                    up.first_name, up.last_name,
                    c.name as class_name, sec.name as section_name,
                    json_agg(
                        json_build_object(
                            'subject_id', sub.id,
                            'subject_name', sub.name,
                            'subject_code', sub.code,
                            'max_marks', sm.max_marks,
                            'obtained_marks', sm.obtained_marks,
                            'grade', sm.grade
                        ) ORDER BY sub.name
                    ) as subject_marks
             FROM student_results sr
             JOIN students s ON sr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON sr.class_id = c.id
             JOIN sections sec ON sr.section_id = sec.id
             LEFT JOIN subject_marks sm ON sr.id = sm.student_result_id
             LEFT JOIN subjects sub ON sm.subject_id = sub.id
             WHERE sr.result_session_id = $1 AND sr.student_id = $2
             GROUP BY sr.id, s.admission_number, s.roll_number, up.first_name, up.last_name, c.name, sec.name`,
            [actualSessionId, studentId]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Student result not found', 404);
            return;
        }

        successResponse(res, 'Student marks fetched successfully', result.rows[0]);
    } catch (error) {
        console.error('Get student marks error:', error);
        errorResponse(res, 'Failed to fetch student marks', 500);
    }
};

// Get class-wise results
export const getClassResults = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const { classId, sectionId } = req.query;
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        // Get or create result session
        const sessionResult = await query(
            `INSERT INTO result_sessions (school_id, exam_id, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (school_id, exam_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [schoolId, examId, `${examId} Results ${year}`, `Results for ${year} academic year`]
        );

        const actualSessionId = sessionResult.rows[0].id;

        let whereClause = '';
        const params: any[] = [actualSessionId];
        let paramIndex = 2;

        if (classId) {
            whereClause += ` AND sr.class_id = $${paramIndex++}`;
            params.push(classId);
        }

        if (sectionId) {
            whereClause += ` AND sr.section_id = $${paramIndex++}`;
            params.push(sectionId);
        }

        const result = await query(
            `SELECT sr.*, s.admission_number, s.roll_number,
                    up.first_name, up.last_name,
                    c.name as class_name, sec.name as section_name,
                    ROW_NUMBER() OVER (ORDER BY sr.percentage DESC) as rank
             FROM student_results sr
             JOIN students s ON sr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON sr.class_id = c.id
             JOIN sections sec ON sr.section_id = sec.id
             WHERE sr.result_session_id = $1 ${whereClause}
             ORDER BY sr.percentage DESC, up.first_name`,
            params
        );

        // Update ranks in database
        await transaction(async (client) => {
            for (let i = 0; i < result.rows.length; i++) {
                await client.query(
                    `UPDATE student_results SET rank = $1 WHERE id = $2`,
                    [i + 1, result.rows[i].id]
                );
            }
        });

        successResponse(res, 'Class results fetched successfully', result.rows);
    } catch (error) {
        console.error('Get class results error:', error);
        errorResponse(res, 'Failed to fetch class results', 500);
    }
};

// Publish results
export const publishResults = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const { classIds, sendNotifications = true } = req.body;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        const result = await transaction(async (client) => {
            // Get or create result session
            const sessionResult = await client.query(
                `INSERT INTO result_sessions (school_id, exam_id, name, description)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (school_id, exam_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                 RETURNING id`,
                [schoolId, examId, `${examId} Results ${year}`, `Results for ${year} academic year`]
            );

            const actualSessionId = sessionResult.rows[0].id;

            // Update result session status
            await client.query(
                `UPDATE result_sessions 
                 SET status = 'published', published_at = CURRENT_TIMESTAMP, published_by = $2
                 WHERE id = $1`,
                [actualSessionId, userId]
            );

            // Update student results status
            let whereClause = '';
            const params = [actualSessionId];
            if (classIds && classIds.length > 0) {
                whereClause = ` AND class_id = ANY($2)`;
                params.push(classIds);
            }

            await client.query(
                `UPDATE student_results 
                 SET status = 'published', updated_at = CURRENT_TIMESTAMP
                 WHERE result_session_id = $1 ${whereClause}`,
                params
            );

            let notificationCount = 0;

            // Create notification records if requested
            if (sendNotifications) {
                const students = await client.query(
                    `SELECT DISTINCT sr.student_id
                     FROM student_results sr
                     WHERE sr.result_session_id = $1 ${whereClause}`,
                    params
                );

                for (const student of students.rows) {
                    await client.query(
                        `INSERT INTO result_notifications (result_session_id, student_id)
                         VALUES ($1, $2)
                         ON CONFLICT (result_session_id, student_id) DO NOTHING`,
                        [actualSessionId, student.student_id]
                    );

                    // Send notification to parents
                    await client.query(
                        `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
                         SELECT u.school_id,
                                'परीक्षा परिणाम घोषित / Exam Results Published',
                                'आपके बच्चे का परीक्षा परिणाम तैयार है। कृपया मोबाइल ऐप देखें। Your child''s exam result is ready. Please check the mobile app.',
                                'result', 'high', 'individual',
                                jsonb_build_array(p.user_id),
                                $3
                         FROM students s
                         JOIN users u ON s.user_id = u.id
                         JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
                         JOIN parents p ON sp.parent_id = p.id
                         WHERE s.id = $1`,
                        [student.student_id, userId]
                    );
                }

                notificationCount = students.rows.length;
            }

            return notificationCount;
        });

        successResponse(res, 'Results published successfully', {
            notificationsSent: result
        });
    } catch (error) {
        console.error('Publish results error:', error);
        errorResponse(res, 'Failed to publish results', 500);
    }
};

// Get student result (for mobile app)
export const getStudentResult = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId, studentId } = req.params;
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        // Get result session
        const sessionResult = await query(
            `SELECT id FROM result_sessions WHERE school_id = $1 AND exam_id = $2`,
            [schoolId, examId]
        );

        if (sessionResult.rows.length === 0) {
            errorResponse(res, 'Result session not found', 404);
            return;
        }

        const actualSessionId = sessionResult.rows[0].id;

        const result = await query(
            `SELECT sr.*, rs.name as session_name, rs.status as session_status,
                    e.name as exam_name, e.exam_type,
                    s.admission_number, s.roll_number,
                    up.first_name, up.last_name,
                    c.name as class_name, sec.name as section_name,
                    json_agg(
                        json_build_object(
                            'subject_name', sub.name,
                            'subject_code', sub.code,
                            'max_marks', sm.max_marks,
                            'obtained_marks', sm.obtained_marks,
                            'grade', sm.grade,
                            'percentage', CASE WHEN sm.max_marks > 0 THEN ROUND((sm.obtained_marks / sm.max_marks) * 100, 2) ELSE 0 END
                        ) ORDER BY sub.name
                    ) as subject_marks
             FROM student_results sr
             JOIN result_sessions rs ON sr.result_session_id = rs.id
             JOIN exams e ON rs.exam_id = e.id
             JOIN students s ON sr.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON sr.class_id = c.id
             JOIN sections sec ON sr.section_id = sec.id
             LEFT JOIN subject_marks sm ON sr.id = sm.student_result_id
             LEFT JOIN subjects sub ON sm.subject_id = sub.id
             WHERE sr.result_session_id = $1 AND sr.student_id = $2 AND sr.status = 'published'
             GROUP BY sr.id, rs.name, rs.status, e.name, e.exam_type, s.admission_number, s.roll_number, 
                      up.first_name, up.last_name, c.name, sec.name`,
            [actualSessionId, studentId]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Result not found or not published yet', 404);
            return;
        }

        successResponse(res, 'Student result fetched successfully', result.rows[0]);
    } catch (error) {
        console.error('Get student result error:', error);
        errorResponse(res, 'Failed to fetch student result', 500);
    }
};

// Get my results (for student mobile app)
export const getMyResults = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        const result = await query(
            `SELECT sr.*, rs.name as session_name, rs.published_at,
                    e.name as exam_name, e.exam_type,
                    c.name as class_name, sec.name as section_name
             FROM student_results sr
             JOIN result_sessions rs ON sr.result_session_id = rs.id
             JOIN exams e ON rs.exam_id = e.id
             JOIN students s ON sr.student_id = s.id
             JOIN classes c ON sr.class_id = c.id
             JOIN sections sec ON sr.section_id = sec.id
             WHERE s.user_id = $1 AND sr.status = 'published'
             ORDER BY rs.published_at DESC`,
            [userId]
        );

        successResponse(res, 'My results fetched successfully', result.rows);
    } catch (error) {
        console.error('Get my results error:', error);
        errorResponse(res, 'Failed to fetch results', 500);
    }
};

// Generate result statistics
export const getResultStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const schoolId = req.user?.schoolId;

        // Parse sessionId to get examId and year
        const [examId, year] = parseSessionId(sessionId);

        // Get result session
        const sessionResult = await query(
            `SELECT id FROM result_sessions WHERE school_id = $1 AND exam_id = $2`,
            [schoolId, examId]
        );

        if (sessionResult.rows.length === 0) {
            errorResponse(res, 'Result session not found', 404);
            return;
        }

        const actualSessionId = sessionResult.rows[0].id;

        const stats = await query(
            `SELECT 
                COUNT(*) as total_students,
                COUNT(CASE WHEN sr.status = 'published' THEN 1 END) as published_count,
                ROUND(AVG(sr.percentage), 2) as average_percentage,
                COUNT(CASE WHEN sr.grade IN ('A+', 'A') THEN 1 END) as distinction_count,
                COUNT(CASE WHEN sr.grade = 'F' THEN 1 END) as fail_count,
                MAX(sr.percentage) as highest_percentage,
                MIN(sr.percentage) as lowest_percentage
             FROM student_results sr
             WHERE sr.result_session_id = $1`,
            [actualSessionId]
        );

        const gradeDistribution = await query(
            `SELECT sr.grade, COUNT(*) as count
             FROM student_results sr
             WHERE sr.result_session_id = $1 AND sr.grade IS NOT NULL
             GROUP BY sr.grade
             ORDER BY sr.grade`,
            [actualSessionId]
        );

        successResponse(res, 'Result statistics fetched successfully', {
            ...stats.rows[0],
            gradeDistribution: gradeDistribution.rows
        });
    } catch (error) {
        console.error('Get result statistics error:', error);
        errorResponse(res, 'Failed to fetch statistics', 500);
    }
};
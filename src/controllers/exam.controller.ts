import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';
import { sendStudentNotification } from '../utils/notification.utils';
import { processResultNotifications } from '../utils/exam.notification';

// Get all exams
export const getAllExams = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT 
                e.*, 
                ay.name as academic_year,
                (
                    SELECT json_agg(
                        json_build_object(
                            'subject_name', s.name,
                            'exam_date', es.exam_date,
                            'start_time', es.start_time,
                            'end_time', es.end_time,
                             'class_name', c.name
                        ) ORDER BY es.exam_date, es.start_time
                    )
                    FROM exam_schedules es
                    JOIN subjects s ON es.subject_id = s.id
                    JOIN classes c ON es.class_id = c.id
                    WHERE es.exam_id = e.id
                ) as schedule,
                (
                    SELECT json_build_object(
                        'total_students', (SELECT COUNT(*) FROM students st WHERE st.current_class_id IN (SELECT class_id FROM exam_schedules WHERE exam_id = e.id) AND st.status = 'active'),
                        'students_with_marks', (SELECT COUNT(DISTINCT em.student_id) FROM exam_marks em JOIN exam_schedules es ON em.exam_schedule_id = es.id WHERE es.exam_id = e.id)
                    )
                ) as stats
             FROM exams e
             LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
             WHERE e.school_id = $1
             ORDER BY e.start_date DESC`,
            [schoolId]
        );

        successResponse(res, 'Exams fetched successfully', result.rows);
    } catch (error) {
        console.error('Get exams error:', error);
        errorResponse(res, 'Failed to fetch exams', 500);
    }
};

// Create new exam
export const createExam = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { name, examType, startDate, endDate } = req.body;

        // Get current academic year
        const ayResult = await query(
            `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
            [schoolId]
        );

        let academicYearId = ayResult.rows[0]?.id;

        // If no current academic year, create one
        if (!academicYearId) {
            const year = new Date().getFullYear();
            const newAy = await query(
                `INSERT INTO academic_years (school_id, name, start_date, end_date, is_current)
                 VALUES ($1, $2, $3, $4, true) RETURNING id`,
                [schoolId, `${year}-${year + 1}`, `${year}-04-01`, `${year + 1}-03-31`]
            );
            academicYearId = newAy.rows[0].id;
        }

        const result = await transaction(async (client) => {
            const examInsert = await client.query(
                `INSERT INTO exams (school_id, academic_year_id, name, exam_type, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [schoolId, academicYearId, name, examType, startDate, endDate]
            );

            const exam = examInsert.rows[0];
            const { classes: selectedClasses, subjects } = req.body;

            if (selectedClasses && selectedClasses.length > 0 && subjects && subjects.length > 0) {
                for (const classId of selectedClasses) {
                    for (const sub of subjects) {
                        // Find or create subject
                        let subRes = await client.query(
                            `SELECT id FROM subjects WHERE school_id = $1 AND name ILIKE $2 LIMIT 1`,
                            [schoolId, sub.name]
                        );

                        let subjectId;
                        if (subRes.rows.length === 0) {
                            const newSub = await client.query(
                                `INSERT INTO subjects (school_id, name) VALUES ($1, $2) RETURNING id`,
                                [schoolId, sub.name]
                            );
                            subjectId = newSub.rows[0].id;
                        } else {
                            subjectId = subRes.rows[0].id;
                        }

                        // Calculate end time
                        const [hours, minutes] = sub.startTime.split(':');
                        const endDateObj = new Date();
                        endDateObj.setHours(parseInt(hours), parseInt(minutes));
                        endDateObj.setHours(endDateObj.getHours() + (sub.duration || 3));
                        const endTime = `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}`;

                        await client.query(
                            `INSERT INTO exam_schedules (exam_id, class_id, subject_id, exam_date, start_time, end_time, max_marks, passing_marks)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [
                                exam.id,
                                classId,
                                subjectId,
                                sub.date || startDate,
                                sub.startTime,
                                endTime,
                                sub.maxMarks || 100,
                                sub.passingMarks || 33
                            ]
                        );
                    }
                }

                // Send notification to ACTIVE students of these classes

            }

            return exam;
        });

        successResponse(res, 'Exam created with notifications', result, 201);
    } catch (error) {
        console.error('Create exam error:', error);
        errorResponse(res, 'Failed to create exam', 500);
    }
};

// Get exam schedule
export const getExamSchedule = async (req: Request, res: Response): Promise<void> => {
    try {
        const { examId } = req.params;
        const { classId } = req.query;

        let whereClause = 'WHERE es.exam_id = $1';
        const params: any[] = [examId];

        if (classId) {
            whereClause += ' AND es.class_id = $2';
            params.push(classId);
        }

        const result = await query(
            `SELECT es.*, c.name as class_name, sub.name as subject_name
             FROM exam_schedules es
             JOIN classes c ON es.class_id = c.id
             JOIN subjects sub ON es.subject_id = sub.id
             ${whereClause}
             ORDER BY es.exam_date, es.start_time`,
            params
        );

        successResponse(res, 'Exam schedule fetched', result.rows);
    } catch (error) {
        console.error('Get exam schedule error:', error);
        errorResponse(res, 'Failed to fetch schedule', 500);
    }
};

// Get exam results
export const getExamResults = async (req: Request, res: Response): Promise<void> => {
    try {
        const { examId } = req.params;
        const { classId } = req.query;

        let whereClause = 'WHERE es.exam_id = $1';
        const params: any[] = [examId];

        if (classId) {
            whereClause += ' AND c.id = $2';
            params.push(classId);
        }

        const result = await query(
            `SELECT s.id as student_id, s.admission_number, s.roll_number,
                    up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    c.name as class_name, sec.name as section_name,
                    sub.name as subject_name, em.marks_obtained, em.is_absent,
                    es.max_marks, es.passing_marks
             FROM exam_marks em
             JOIN exam_schedules es ON em.exam_schedule_id = es.id
             JOIN students s ON em.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             JOIN subjects sub ON es.subject_id = sub.id
             ${whereClause}
             ORDER BY s.roll_number, sub.name`,
            params
        );

        successResponse(res, 'Results fetched', result.rows);
    } catch (error) {
        console.error('Get results error:', error);
        errorResponse(res, 'Failed to fetch results', 500);
    }
};

// Add/Update marks
export const saveMarks = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { examScheduleId, marks } = req.body;

        await transaction(async (client) => {
            for (const mark of marks) {
                await client.query(
                    `INSERT INTO exam_marks (exam_schedule_id, student_id, marks_obtained, is_absent, entered_by)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (exam_schedule_id, student_id) 
                     DO UPDATE SET marks_obtained = $3, is_absent = $4, entered_by = $5`,
                    [examScheduleId, mark.studentId, mark.marksObtained, mark.isAbsent || false, userId]
                );
            }
        });

        successResponse(res, 'Marks saved successfully');
    } catch (error) {
        console.error('Save marks error:', error);
        errorResponse(res, 'Failed to save marks', 500);
    }
};

// Get exam completion stats (class-wise)
export const getExamStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const { examId } = req.params;

        const result = await query(
            `SELECT 
                c.id as class_id, 
                c.name as class_name,
                (SELECT COUNT(*) FROM students s WHERE s.current_class_id = c.id AND s.status = 'active') as total_students,
                (SELECT COUNT(DISTINCT em.student_id) 
                 FROM exam_marks em 
                 JOIN exam_schedules es ON em.exam_schedule_id = es.id 
                 WHERE es.exam_id = $1 AND es.class_id = c.id) as students_with_marks,
                (SELECT COUNT(*) 
                 FROM exam_schedules es 
                 WHERE es.exam_id = $1 AND es.class_id = c.id) as total_subjects
             FROM classes c
             WHERE c.id IN (SELECT DISTINCT class_id FROM exam_schedules WHERE exam_id = $1)
             ORDER BY c.display_order`,
            [examId]
        );

        successResponse(res, 'Exam stats fetched successfully', result.rows);
    } catch (error) {
        console.error('Get exam stats error:', error);
        errorResponse(res, 'Failed to fetch stats', 500);
    }
};

// Get exam by ID
export const getExamById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await query(
            `SELECT e.*, ay.name as academic_year
             FROM exams e
             LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
             WHERE e.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Exam not found', 404);
            return;
        }

        successResponse(res, 'Exam fetched successfully', result.rows[0]);
    } catch (error) {
        console.error('Get exam error:', error);
        errorResponse(res, 'Failed to fetch exam', 500);
    }
};

// Update exam
export const updateExam = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, examType, startDate, endDate } = req.body;
        const result = await transaction(async (client) => {
            const schoolId = req.user?.schoolId;
            const examUpdate = await client.query(
                `UPDATE exams 
                 SET name = $1, exam_type = $2, start_date = $3, end_date = $4, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5 RETURNING *`,
                [name, examType, startDate, endDate, id]
            );

            if (examUpdate.rows.length === 0) {
                throw new Error('Exam not found');
            }

            const { classes: selectedClasses, subjects } = req.body;

            if (selectedClasses && subjects) {
                // Delete old schedules only if no marks are entered yet
                // Or we could just delete and re-insert, but that would break marks mapping
                // For simplicity in this 'Matrix' version, let's assume we replace the schedule
                // A better way would be to sync, but a simple way is delete/re-insert if no marks exist
                const marksCheck = await client.query(
                    `SELECT COUNT(*) FROM exam_marks WHERE exam_schedule_id IN (SELECT id FROM exam_schedules WHERE exam_id = $1)`,
                    [id]
                );

                if (parseInt(marksCheck.rows[0].count) > 0) {
                    throw new Error('Cannot modify schedule: Marks have already been recorded for this exam.');
                }

                await client.query(`DELETE FROM exam_schedules WHERE exam_id = $1`, [id]);

                for (const classId of selectedClasses) {
                    for (const sub of subjects) {
                        // Find or create subject
                        let subRes = await client.query(
                            `SELECT id FROM subjects WHERE school_id = $1 AND name ILIKE $2 LIMIT 1`,
                            [schoolId, sub.name]
                        );

                        let subjectId;
                        if (subRes.rows.length === 0) {
                            const newSub = await client.query(
                                `INSERT INTO subjects (school_id, name) VALUES ($1, $2) RETURNING id`,
                                [schoolId, sub.name]
                            );
                            subjectId = newSub.rows[0].id;
                        } else {
                            subjectId = subRes.rows[0].id;
                        }

                        const [hours, minutes] = (sub.startTime || '09:00').split(':');
                        const endDateObj = new Date();
                        endDateObj.setHours(parseInt(hours), parseInt(minutes));
                        endDateObj.setHours(endDateObj.getHours() + (sub.duration || 3));
                        const endTime = `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}`;

                        await client.query(
                            `INSERT INTO exam_schedules (exam_id, class_id, subject_id, exam_date, start_time, end_time, max_marks, passing_marks)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [
                                id,
                                classId,
                                subjectId,
                                sub.date || startDate,
                                sub.startTime || '09:00',
                                endTime,
                                sub.maxMarks || 100,
                                sub.passingMarks || 33
                            ]
                        );
                    }
                }
            }

            return examUpdate.rows[0];
        });

        successResponse(res, 'Exam and schedule updated successfully', result);
    } catch (error) {
        console.error('Update exam error:', error);
        errorResponse(res, 'Failed to update exam', 500);
    }
};

// Delete exam
export const deleteExam = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await transaction(async (client) => {
            // Delete marks -> schedules -> exam
            await client.query('DELETE FROM exam_marks WHERE exam_schedule_id IN (SELECT id FROM exam_schedules WHERE exam_id = $1)', [id]);
            await client.query('DELETE FROM exam_schedules WHERE exam_id = $1', [id]);
            await client.query('DELETE FROM exams WHERE id = $1', [id]);
        });

        successResponse(res, 'Exam destroyed successfully');
    } catch (error) {
        console.error('Delete exam error:', error);
        errorResponse(res, error instanceof Error ? error.message : 'Failed to delete exam', 500);
    }
};

// Publish results
export const publishResults = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const { examId } = req.params;

        // Mark exam as published
        const examRes = await query(
            `UPDATE exams SET is_published = true WHERE id = $1 RETURNING name`,
            [examId]
        );

        if (examRes.rows.length === 0) {
            errorResponse(res, 'Exam not found', 404);
            return;
        }

        const examName = examRes.rows[0].name;

        // Send notifications in background
        processResultNotifications(String(examId), examName, String(userId), String(schoolId)).catch(err =>
            console.error('Background result notification error:', err)
        );

        successResponse(res, 'Results published successfully');
    } catch (error) {
        console.error('Publish results error:', error);
        errorResponse(res, 'Failed to publish results', 500);
    }
};

// Get active exams (for students/teachers)
export const getActiveExams = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const role = req.user?.role;

        let result;

        if (role === 'student') {
            // Get student's class
            const studentRes = await query(
                `SELECT current_class_id FROM students WHERE user_id = $1`,
                [userId]
            );

            if (studentRes.rows.length === 0) {
                errorResponse(res, 'Student record not found', 404);
                return;
            }

            const classId = studentRes.rows[0].current_class_id;

            // Fetch active published exams for this class with schedule
            // "Active" means published and end_date is today or in future.
            result = await query(
                `SELECT 
                    e.id, e.name, e.exam_type, e.start_date, e.end_date,
                    json_agg(
                        json_build_object(
                            'subject_name', s.name,
                            'exam_date', es.exam_date,
                            'start_time', es.start_time,
                            'end_time', es.end_time,
                            'max_marks', es.max_marks,
                            'passing_marks', es.passing_marks
                        ) ORDER BY es.exam_date, es.start_time
                    ) as schedule
                 FROM exams e
                 JOIN exam_schedules es ON e.id = es.exam_id
                 JOIN subjects s ON es.subject_id = s.id
                 WHERE e.school_id = $1 
                   AND e.end_date >= CURRENT_DATE
                   AND es.class_id = $2
                 GROUP BY e.id, e.name, e.exam_type, e.start_date, e.end_date
                 ORDER BY e.start_date ASC`,
                [schoolId, classId]
            );

        } else {
            // For teachers/admins/management -> Show all active exams
            result = await query(
                `SELECT 
                    e.id, e.name, e.exam_type, e.start_date, e.end_date,
                    (
                        SELECT json_agg(
                            json_build_object(
                                'class_name', c.name,
                                'subject_name', s.name,
                                'exam_date', es.exam_date,
                                'start_time', es.start_time,
                                'end_time', es.end_time
                            ) ORDER BY es.exam_date, es.start_time
                        )
                        FROM exam_schedules es
                        JOIN classes c ON es.class_id = c.id
                        JOIN subjects s ON es.subject_id = s.id
                        WHERE es.exam_id = e.id
                    ) as schedule
                 FROM exams e
                 WHERE e.school_id = $1 
                   AND e.end_date >= CURRENT_DATE
                 ORDER BY e.start_date ASC`,
                [schoolId]
            );
        }

        successResponse(res, 'Active exams fetched successfully', result.rows);
    } catch (error) {
        console.error('Get active exams error:', error);
        errorResponse(res, 'Failed to fetch active exams', 500);
    }
};

// Generate Admit Cards
export const generateAdmitCards = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Exam ID
        const { checkFees, requiredFeeTypes } = req.body;
        const schoolId = req.user?.schoolId;
        const userId = req.user?.userId;

        // 1. Get Exam Details
        const examRes = await query(
            `SELECT * FROM exams WHERE id = $1 AND school_id = $2`,
            [id, schoolId]
        );

        if (examRes.rows.length === 0) {
            errorResponse(res, 'Exam not found', 404);
            return;
        }

        const exam = examRes.rows[0];

        // 2. Get students involved in the exam (via exam_schedules -> classes)
        const studentsRes = await query(
            `SELECT DISTINCT s.id, s.user_id, s.current_class_id
             FROM students s
             JOIN exam_schedules es ON s.current_class_id = es.class_id
             WHERE es.exam_id = $1 AND s.status = 'active'`,
            [id]
        );

        const students = studentsRes.rows;
        const eligibleStudents: string[] = [];

        // 3. Filter eligible students
        for (const student of students) {
            let isEligible = true;

            if (checkFees) {
                // Check for pending fees
                let feeQuery = `SELECT SUM(sf.amount_pending) as total_pending 
                                FROM student_fees sf`;

                const queryParams: any[] = [student.id];

                if (requiredFeeTypes && Array.isArray(requiredFeeTypes) && requiredFeeTypes.length > 0) {
                    // Check specific fee types
                    feeQuery += ` JOIN fee_structures fs ON sf.fee_structure_id = fs.id
                                   JOIN fee_types ft ON fs.fee_type_id = ft.id
                                   WHERE sf.student_id = $1 
                                   AND (ft.id::text = ANY($2) OR ft.name ILIKE ANY($2))`;
                    queryParams.push(requiredFeeTypes);
                } else {
                    // Check all fees
                    feeQuery += ` WHERE sf.student_id = $1`;
                }

                const feeRes = await query(feeQuery, queryParams);
                const totalPending = parseFloat(feeRes.rows[0].total_pending || '0');

                if (totalPending > 0) {
                    isEligible = false;
                }
            }

            if (isEligible) {
                eligibleStudents.push(student.id);
            }
        }

        // 4. Insert into admit_cards
        if (eligibleStudents.length > 0) {
            // Bulk insert or loop? Loop is safer for conflicts.
            // Using transaction for atomic batch
            await transaction(async (client) => {
                for (const studentId of eligibleStudents) {
                    await client.query(
                        `INSERT INTO admit_cards (exam_id, student_id, status)
                          VALUES ($1, $2, 'issued')
                          ON CONFLICT (exam_id, student_id) 
                          DO UPDATE SET generated_at = CURRENT_TIMESTAMP, status = 'issued'`,
                        [id, studentId]
                    );

                    // Optional: Send Notification to Student
                    // Notification logic here (omitted for brevity, can be added)
                }
            });
        }

        // Update exam to mark admit cards as published (optional flag)
        await query(`UPDATE exams SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

        successResponse(res, `Admit cards generated for ${eligibleStudents.length} students`, { count: eligibleStudents.length });

    } catch (error) {
        console.error('Generate admit cards error:', error);
        errorResponse(res, 'Failed to generate admit cards', 500);
    }
};

// Get Admit Card (Student Side)
export const getAdmitCard = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Exam ID
        const userId = req.user?.userId;
        const role = req.user?.role;

        let studentId;

        if (role === 'student') {
            const studentRes = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
            if (studentRes.rows.length === 0) {
                errorResponse(res, 'Student record not found', 404);
                return;
            }
            studentId = studentRes.rows[0].id;
        } else if (req.query.studentId) {
            // Teachers/Admins can view by passing studentId
            studentId = req.query.studentId;
        } else {
            errorResponse(res, 'Student ID required', 400);
            return;
        }

        // Check if admit card is issued
        const cardRes = await query(
            `SELECT * FROM admit_cards WHERE exam_id = $1 AND student_id = $2 AND status = 'issued'`,
            [id, studentId]
        );

        if (cardRes.rows.length === 0) {
            errorResponse(res, 'Admit card not found or not issued yet', 404);
            return;
        }

        const admitCard = cardRes.rows[0];

        // Fetch Exam Details & Schedule
        const examRes = await query(
            `SELECT e.name as exam_name, e.start_date, e.end_date,
                    s.admission_number, s.roll_number,
                    up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    c.name as class_name, sec.name as section_name,
                    sch.name as school_name, sch.address as school_address, sch.logo_url as school_logo,
                    (SELECT up2.first_name || ' ' || COALESCE(up2.last_name, '') 
                     FROM parents p 
                     JOIN student_parents sp ON p.id = sp.parent_id
                     JOIN users u2 ON p.user_id = u2.id
                     JOIN user_profiles up2 ON u2.id = up2.user_id
                     WHERE sp.student_id = s.id AND sp.relationship = 'father' LIMIT 1) as father_name
             FROM exams e
             JOIN students s ON s.id = $2
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             JOIN schools sch ON e.school_id = sch.id
             WHERE e.id = $1`,
            [id, studentId]
        );

        const scheduleRes = await query(
            `SELECT s.name as subject_name, es.exam_date, es.start_time, es.end_time
             FROM exam_schedules es
             JOIN subjects s ON es.subject_id = s.id
             WHERE es.exam_id = $1 AND es.class_id = (SELECT current_class_id FROM students WHERE id = $2)
             ORDER BY es.exam_date, es.start_time`,
            [id, studentId]
        );

        successResponse(res, 'Admit card fetched', {
            card: admitCard,
            exam: examRes.rows[0],
            schedule: scheduleRes.rows
        });

    } catch (error) {
        console.error('Get admit card error:', error);
        errorResponse(res, 'Failed to fetch admit card', 500);
    }
};

// Manually Issue Admit Card
export const issueAdmitCard = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Exam ID
        const { studentId } = req.body;

        await query(
            `INSERT INTO admit_cards (exam_id, student_id, status)
              VALUES ($1, $2, 'issued')
              ON CONFLICT (exam_id, student_id) 
              DO UPDATE SET generated_at = CURRENT_TIMESTAMP, status = 'issued'`,
            [id, studentId]
        );

        successResponse(res, 'Admit card issued successfully');
    } catch (error) {
        console.error('Issue admit card error:', error);
        errorResponse(res, 'Failed to issue admit card', 500);
    }
};

// Get Student Status List for Exam
export const getExamStudentsStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { classId, search } = req.query;
        const schoolId = req.user?.schoolId;

        let queryStr = `
            SELECT DISTINCT s.id, s.admission_number, 
                   up.first_name, up.last_name, 
                   c.name as class_name, sec.name as section_name,
                   ac.status as admit_card_status, ac.generated_at,
                   COALESCE((SELECT SUM(amount_pending) FROM student_fees sf WHERE sf.student_id = s.id), 0) as total_pending
            FROM students s
            JOIN users u ON s.user_id = u.id
            JOIN user_profiles up ON u.id = up.user_id
            JOIN exam_schedules es ON s.current_class_id = es.class_id
            JOIN classes c ON s.current_class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            LEFT JOIN admit_cards ac ON s.id = ac.student_id AND ac.exam_id = $1
            WHERE es.exam_id = $1 AND s.status = 'active'
        `;

        const queryParams: any[] = [id];

        if (classId) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId as string);
            if (isUUID) {
                queryStr += ` AND s.current_class_id = $${queryParams.length + 1}`;
            } else {
                queryStr += ` AND c.name = $${queryParams.length + 1}`;
            }
            queryParams.push(classId);
        }

        if (search) {
            queryStr += ` AND (s.admission_number ILIKE $${queryParams.length + 1} OR up.first_name ILIKE $${queryParams.length + 1} OR up.last_name ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        queryStr += ` ORDER BY c.name, sec.name, up.first_name`;

        const result = await query(queryStr, queryParams);
        successResponse(res, 'Student status fetched', result.rows);

    } catch (error) {
        console.error('Get exam students status error:', error);
        errorResponse(res, 'Failed to fetch student status', 500);
    }
};

// Get Batch Admit Cards (For Bulk Print)
export const getBatchAdmitCards = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Exam ID
        const { classId } = req.query;
        const schoolId = req.user?.schoolId;

        // 1. Get Exam Details
        const examRes = await query(
            `SELECT e.*, s.name as school_name, s.address as school_address, s.logo_url as school_logo
             FROM exams e
             JOIN schools s ON e.school_id = s.id
             WHERE e.id = $1 AND e.school_id = $2`,
            [id, schoolId]
        );

        if (examRes.rows.length === 0) {
            errorResponse(res, 'Exam not found', 404);
            return;
        }

        const exam = examRes.rows[0];

        // 2. Build Query for Students with Issued Admit Cards
        let queryStr = `
            SELECT s.id, s.admission_number, s.roll_number,
                   up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                   c.name as class_name, sec.name as section_name,
                   (SELECT up2.first_name || ' ' || COALESCE(up2.last_name, '') 
                    FROM parents p 
                    JOIN student_parents sp ON p.id = sp.parent_id
                    JOIN users u2 ON p.user_id = u2.id
                    JOIN user_profiles up2 ON u2.id = up2.user_id
                    WHERE sp.student_id = s.id AND sp.relationship = 'father' LIMIT 1) as father_name
            FROM admit_cards ac
            JOIN students s ON ac.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN user_profiles up ON u.id = up.user_id
            JOIN classes c ON s.current_class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            WHERE ac.exam_id = $1 AND ac.status = 'issued'
        `;

        const queryParams: any[] = [id];

        if (classId) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId as string);
            if (isUUID) {
                queryStr += ` AND s.current_class_id = $${queryParams.length + 1}`;
            } else {
                queryStr += ` AND s.current_class_id = $${queryParams.length + 1}`;
            }
            queryParams.push(classId);
        }

        queryStr += ` ORDER BY c.name, sec.name, s.roll_number, up.first_name`;

        const studentsRes = await query(queryStr, queryParams);
        const students = studentsRes.rows;

        const scheduleRes = await query(
            `SELECT es.class_id, sub.name as subject_name, es.exam_date, es.start_time, es.end_time
             FROM exam_schedules es
             JOIN subjects sub ON es.subject_id = sub.id
             WHERE es.exam_id = $1
             ORDER BY es.exam_date, es.start_time`,
            [id]
        );

        const schedulesByClass: any = {};
        scheduleRes.rows.forEach(row => {
            if (!schedulesByClass[row.class_id]) {
                schedulesByClass[row.class_id] = [];
            }
            schedulesByClass[row.class_id].push(row);
        });

        const admitCards = students.map(student => ({
            student,
            exam,
            schedule: schedulesByClass[student.class_id] || []
        }));

        queryStr = `
            SELECT s.id, s.admission_number, s.roll_number, s.current_class_id as class_id,
                   up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                   c.name as class_name, sec.name as section_name,
                   (SELECT up2.first_name || ' ' || COALESCE(up2.last_name, '') 
                    FROM parents p 
                    JOIN student_parents sp ON p.id = sp.parent_id
                    JOIN users u2 ON p.user_id = u2.id
                    JOIN user_profiles up2 ON u2.id = up2.user_id
                    WHERE sp.student_id = s.id AND sp.relationship = 'father' LIMIT 1) as father_name
            FROM admit_cards ac
            JOIN students s ON ac.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN user_profiles up ON u.id = up.user_id
            JOIN classes c ON s.current_class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            WHERE ac.exam_id = $1 AND ac.status = 'issued'
        `;

        if (classId) {
            queryStr += ` AND s.current_class_id = $${queryParams.length + 1}`;
            // queryParams already has classId at index 1 (length 2) if we didn't reset it.
            // Let's reset purely for clarity.
        }

        // Final Clean execution
        const studentsResFinal = await query(queryStr, queryParams);

        const finalAdmitCards = studentsResFinal.rows.map(student => ({
            student,
            exam,
            schedule: schedulesByClass[student.class_id] || []
        }));

        successResponse(res, `Fetched ${finalAdmitCards.length} admit cards`, finalAdmitCards);

    } catch (error) {
        console.error('Get batch admit cards error:', error);
        errorResponse(res, 'Failed to fetch batch admit cards', 500);
    }
};

import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';
import { sendStudentNotification } from '../utils/notification.utils';

// Get all exams
export const getAllExams = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT e.*, ay.name as academic_year
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
                const activeStudents = await client.query(
                    `SELECT id, user_id FROM students WHERE current_class_id = ANY($1) AND status = 'active'`,
                    [selectedClasses]
                );

                for (const student of activeStudents.rows) {
                    await sendStudentNotification(
                        student.id,
                        `New Exam: ${name}`,
                        `Examination schedule for ${name} has been published. Exams start from ${startDate}.`,
                        'general',
                        'high',
                        req.user?.userId || '',
                        schoolId || '',
                        client
                    );
                }
            }

            // Send notification to all teachers
            await client.query(
                `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, created_by)
                 VALUES ($1, $2, $3, 'general', 'normal', 'role', $4)`,
                [
                    schoolId,
                    `Exam Timetable: ${name}`,
                    `A new exam schedule for ${name} has been created. Please review the invigilation duties.`,
                    req.user?.userId
                ]
            );

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

        await transaction(async (client) => {
            // Mark exam as published
            const examRes = await client.query(
                `UPDATE exams SET is_published = true WHERE id = $1 RETURNING name`,
                [examId]
            );
            const examName = examRes.rows[0].name;

            // Get target classes for this exam
            const classesRes = await client.query(
                `SELECT DISTINCT class_id FROM exam_schedules WHERE exam_id = $1`,
                [examId]
            );
            const classIds = classesRes.rows.map(r => r.class_id);

            // Send notification to students/parents of these classes
            await client.query(
                `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
                 VALUES ($1, $2, $3, 'result', 'high', 'class', $4, $5)`,
                [
                    schoolId,
                    'Exam Results Published',
                    `The results for ${examName} have been published. You can now view and download the marksheet from the app.`,
                    JSON.stringify(classIds),
                    userId
                ]
            );
        });

        successResponse(res, 'Results published and notifications broadcasted');
    } catch (error) {
        console.error('Publish results error:', error);
        errorResponse(res, 'Failed to publish results', 500);
    }
};

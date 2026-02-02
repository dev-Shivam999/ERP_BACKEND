import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse, paginate, getTotalPages } from '../utils';

// Get all teachers with filters
export const getAllTeachers = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { search, designation, status, page = 1, limit = 20 } = req.query;

        const { offset, limit: pageLimit } = paginate(Number(page), Number(limit));

        let whereClause = 'WHERE u.school_id = $1';
        const params: any[] = [schoolId];
        let paramIndex = 2;

        if (designation) {
            whereClause += ` AND t.designation = $${paramIndex++}`;
            params.push(designation);
        }

        if (status) {
            whereClause += ` AND t.status = $${paramIndex++}`;
            params.push(status);
        }

        if (search) {
            whereClause += ` AND (up.first_name ILIKE $${paramIndex} OR up.last_name ILIKE $${paramIndex} OR t.employee_id ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM teachers t
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             ${whereClause}`,
            params
        );

        const total = parseInt(countResult.rows[0].count);

        // Get teachers
        params.push(pageLimit, offset);
        const result = await query(
            `SELECT t.id, t.user_id, t.employee_id, t.designation, t.qualification, t.experience_years, 
                    t.joining_date, t.status,
                    up.first_name, up.last_name, up.photo_url,
                    u.email, u.phone, u.permissions,u.password_hash
             FROM teachers t
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             ${whereClause}
             ORDER BY up.first_name
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        successResponse(res, 'Teachers fetched successfully', result.rows, 200, {
            page: Number(page),
            limit: pageLimit,
            total,
            totalPages: getTotalPages(total, pageLimit),
        });
    } catch (error) {
        console.error('Get teachers error:', error);
        errorResponse(res, 'Failed to fetch teachers', 500);
    }
};

// Get teacher by ID
export const getTeacherById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT t.*, up.first_name, up.last_name, up.gender, up.date_of_birth,
                    up.address, up.city, up.state, up.pincode, up.photo_url,
                    up.aadhar_number, u.email, u.phone, u.permissions
             FROM teachers t
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             WHERE t.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Teacher not found', 404);
            return;
        }

        const teacher = result.rows[0];

        // Get assignments
        const assignments = await query(
            `SELECT tca.*, c.name as class_name, s.name as section_name, sub.name as subject_name
             FROM teacher_class_assignments tca
             LEFT JOIN classes c ON tca.class_id = c.id
             LEFT JOIN sections s ON tca.section_id = s.id
             LEFT JOIN subjects sub ON tca.subject_id = sub.id
             WHERE tca.teacher_id = $1`,
            [id]
        );

        teacher.assignments = assignments.rows;

        successResponse(res, 'Teacher fetched successfully', teacher);
    } catch (error) {
        console.error('Get teacher error:', error);
        errorResponse(res, 'Failed to fetch teacher', 500);
    }
};

// Get current teacher profile
export const getTeacherProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        const result = await query(
            `SELECT t.*, up.first_name, up.last_name, up.gender, up.date_of_birth,
                    up.address, up.city, up.state, up.pincode, up.photo_url,
                    up.aadhar_number, u.email, u.phone, u.permissions
             FROM teachers t
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Teacher profile not found', 404);
            return;
        }

        const teacher = result.rows[0];

        // Get assignments
        const assignments = await query(
            `SELECT tca.*, c.name as class_name, s.name as section_name, sub.name as subject_name
             FROM teacher_class_assignments tca
             LEFT JOIN classes c ON tca.class_id = c.id
             LEFT JOIN sections s ON tca.section_id = s.id
             LEFT JOIN subjects sub ON tca.subject_id = sub.id
             WHERE tca.teacher_id = $1`,
            [teacher.id]
        );

        teacher.assignments = assignments.rows;

        successResponse(res, 'Teacher profile fetched successfully', teacher);
    } catch (error) {
        console.error('Get teacher profile error:', error);
        errorResponse(res, 'Failed to fetch teacher profile', 500);
    }
};

// Create new teacher
export const createTeacher = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const {
            firstName, lastName,
            email, phone,
            designation, qualification, experienceYears, joiningDate,
            isClassTeacher, classId, sectionId, stream, permissions
        } = req.body;

        const result = await transaction(async (client) => {
            // Get current academic year
            const ayResult = await client.query(
                `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
                [schoolId]
            );
            const academicYearId = ayResult.rows[0]?.id;

            // Generate employee ID
            const year = new Date().getFullYear();
            const countResult = await client.query(
                `SELECT COUNT(*) FROM teachers t JOIN users u ON t.user_id = u.id WHERE u.school_id = $1`,
                [schoolId]
            );
            const count = parseInt(countResult.rows[0].count) + 1;
            const employeeId = `EMP${year}${String(count).padStart(4, '0')}`;

           

            // Create user
            const userResult = await client.query(
                `INSERT INTO users (school_id, email, password_hash, phone, role, permissions)
                 VALUES ($1, $2, $3, $4, 'teacher', $5)
                 RETURNING id`,
                [schoolId, email.toLowerCase(), employeeId, phone || null, JSON.stringify(permissions || {})]
            );
            const userId = userResult.rows[0].id;

            // Create profile
            await client.query(
                `INSERT INTO user_profiles (user_id, first_name, last_name)
                 VALUES ($1, $2, $3)`,
                [userId, firstName, lastName || '']
            );

            // Create teacher
            const teacherResult = await client.query(
                `INSERT INTO teachers (user_id, employee_id, designation, qualification, experience_years, joining_date)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [userId, employeeId, designation || 'teacher', qualification, parseInt(experienceYears) || 0, joiningDate || new Date()]
            );

            const teacherId = teacherResult.rows[0].id;

            // Handle Class Teacher Assignment
            if (isClassTeacher && classId && sectionId && academicYearId) {
                // Check if already assigned (the DB index will protect this, but good to be explicit)
                await client.query(
                    `INSERT INTO teacher_class_assignments (teacher_id, class_id, section_id, academic_year_id, is_class_teacher, subject_id)
                     SELECT $1, $2, $3, $4, true, s.id
                     FROM subjects s
                     WHERE s.school_id = $5 AND s.name ILIKE '%General%'
                     LIMIT 1
                     ON CONFLICT (class_id, section_id, subject_id, academic_year_id) DO UPDATE SET is_class_teacher = true`,
                    [teacherId, classId, sectionId, academicYearId, schoolId]
                );
            }

            return {
                id: teacherId,
                employeeId,
                userId,
                defaultPassword: employeeId,
            };
        });

        successResponse(res, 'Teacher created successfully', result, 201);
    } catch (error) {
        console.error('Create teacher error:', error);
        errorResponse(res, 'Failed to create teacher', 500);
    }
};

// Update teacher
export const updateTeacher = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { profile, teacher, permissions, assignment } = req.body;
        const schoolId = req.user?.schoolId;

        await transaction(async (client) => {
            if (teacher) {
                let parsedExp = parseInt(teacher.experience_years);
                const expYears = (teacher.experience_years === '' || teacher.experience_years === undefined || teacher.experience_years === null || isNaN(parsedExp))
                    ? null
                    : parsedExp;

                await client.query(
                    `UPDATE teachers SET
                        designation = COALESCE($2, designation),
                        qualification = COALESCE($3, qualification),
                        experience_years = COALESCE($4, experience_years),
                        status = COALESCE($5, status)
                     WHERE id = $1`,
                    [id, teacher.designation, teacher.qualification, expYears, teacher.status]
                );
            }

            if (profile || permissions) {
                const teacherData = await client.query('SELECT user_id FROM teachers WHERE id = $1', [id]);
                if (teacherData.rows.length > 0) {
                    const userId = teacherData.rows[0].user_id;

                    if (profile) {
                        await client.query(
                            `UPDATE user_profiles SET
                                first_name = COALESCE($2, first_name),
                                last_name = COALESCE($3, last_name),
                                address = COALESCE($4, address),
                                city = COALESCE($5, city),
                                state = COALESCE($6, state),
                                pincode = COALESCE($7, pincode)
                             WHERE user_id = $1`,
                            [userId, profile.first_name, profile.last_name, profile.address, profile.city, profile.state, profile.pincode]
                        );
                    }

                    if (permissions) {
                        await client.query(
                            `UPDATE users SET permissions = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                            [userId, JSON.stringify(permissions)]
                        );
                    }
                }
            }

            if (assignment && assignment.isClassTeacher && assignment.classId) {
                // ... (Existing Class Teacher Logic - Keep as is or wrap in a check)
                // Actually, existing logic handles 'assignment' object for Class Teacher.
                // We will add logic for 'subjectAssignments' which is an array.

                // Existing Class Teacher Logic reused...
                // Ensure sectionId exists...
                let sectionId = assignment.sectionId;
                if (!sectionId) {
                    const secResult = await client.query('SELECT id FROM sections WHERE class_id = $1 LIMIT 1', [assignment.classId]);
                    if (secResult.rows.length > 0) sectionId = secResult.rows[0].id;
                    else {
                        const newSec = await client.query("INSERT INTO sections (school_id, class_id, name) VALUES ($1, $2, 'A') RETURNING id", [schoolId, assignment.classId]);
                        sectionId = newSec.rows[0].id;
                    }
                }

                // Get current academic year
                const ayResult = await client.query(
                    `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
                    [schoolId]
                );
                const academicYearId = ayResult.rows[0]?.id;

                // ... (Logic to ensure AY exists if missing) ...
                const finalAyId = academicYearId || (await client.query(`SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`, [schoolId])).rows[0]?.id;

                if (finalAyId) {
                    // Find General Subject
                    let subjectResult = await client.query(`SELECT id FROM subjects WHERE school_id = $1 AND name ILIKE '%General%' LIMIT 1`, [schoolId]);
                    if (subjectResult.rows.length === 0) subjectResult = await client.query(`SELECT id FROM subjects WHERE school_id = $1 LIMIT 1`, [schoolId]);

                    let subjectId;
                    if (subjectResult.rows.length > 0) {
                        subjectId = subjectResult.rows[0].id;
                    } else {
                        const newSubject = await client.query(`INSERT INTO subjects (school_id, name, code, is_optional) values ($1, 'General', 'GEN', false) RETURNING id`, [schoolId]);
                        subjectId = newSubject.rows[0].id;
                    }

                    await client.query(
                        `INSERT INTO teacher_class_assignments (teacher_id, class_id, section_id, academic_year_id, is_class_teacher, subject_id)
                         VALUES ($1, $2, $3, $4, true, $5)
                         ON CONFLICT (class_id, section_id, subject_id, academic_year_id) 
                         DO UPDATE SET is_class_teacher = true, teacher_id = $1`,
                        [id, assignment.classId, sectionId, finalAyId, subjectId]
                    );
                }
            }

            // NEW: Handle Multiple Subject Assignments
            // Expecting req.body.subjectAssignments = [{classId, sectionId, subjectId}, ...]
            const subjectAssignments = req.body.subjectAssignments;
            if (Array.isArray(subjectAssignments)) {
                // Get current academic year
                const ayResult = await client.query(`SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`, [schoolId]);
                const academicYearId = ayResult.rows[0]?.id;

                if (academicYearId) {
                    // 1. Remove existing NON-CLASS-TEACHER assignments for this teacher?
                    // Or just generic cleanup? 
                    // Safe approach: Delete all assignments for this teacher in current AY where is_class_teacher is FALSE.
                    // Because the UI likely sends the Full List of subject assignments.
                    await client.query(
                        `DELETE FROM teacher_class_assignments 
                          WHERE teacher_id = $1 AND academic_year_id = $2 AND is_class_teacher = false`,
                        [id, academicYearId]
                    );

                    // 2. Insert new assignments
                    for (const assign of subjectAssignments) {
                        if (assign.classId && assign.sectionId && assign.subjectId) {
                            await client.query(
                                `INSERT INTO teacher_class_assignments (teacher_id, class_id, section_id, subject_id, academic_year_id, is_class_teacher)
                                  VALUES ($1, $2, $3, $4, $5, false)
                                  ON CONFLICT (class_id, section_id, subject_id, academic_year_id)
                                  DO UPDATE SET teacher_id = $1`, // If another teacher was assigned, overwrite them? Or maybe error? For now overwrite.
                                [id, assign.classId, assign.sectionId, assign.subjectId, academicYearId]
                            );
                        }
                    }
                }
            }
        });

        successResponse(res, 'Teacher updated successfully');
    } catch (error) {
        console.error('Update teacher error:', error);
        errorResponse(res, 'Failed to update teacher', 500);
    }
};

// Get teacher's assigned classes
export const getTeacherClasses = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;

        // Check teacher designation first
        const teacherRes = await query(
            `SELECT designation FROM teachers WHERE user_id = $1`,
            [userId]
        );

        if (teacherRes.rows.length === 0) {
            errorResponse(res, 'Teacher profile not found', 404);
            return;
        }

        const designation = teacherRes.rows[0]?.designation;
        const role = req.user?.role;
        console.log("designation", designation);
        console.log("role", role);

        const isSenior = role === 'admin' || ['principal', 'head_teacher', 'vice_principal'].includes(designation);

        let result;

        if (isSenior) {
            // Senior teachers see ALL classes
            result = await query(
                `SELECT 
                    c.id as class_id, c.name as class_name,
                    s.id as section_id, s.name as section_name,
                    'All Subjects' as subject_name,
                    NULL as subject_id,
                    (SELECT COUNT(*) FROM students st WHERE st.current_class_id = c.id AND st.section_id = s.id AND st.status = 'active') as student_count
                 FROM classes c
                 JOIN sections s ON s.class_id = c.id
                 WHERE c.school_id = $1
                 ORDER BY c.numeric_value, s.name`,
                [schoolId]
            );
        } else {
            // Regular teachers see assigned classes
            // If forAttendance is true, ONLY show classes where they are the Class Teacher
            const { forAttendance } = req.query;
            let classTeacherFilter = '';

            if (forAttendance === 'true') {
                classTeacherFilter = 'AND tca.is_class_teacher = true';
            }

            result = await query(
                `SELECT 
                    c.id as class_id, c.name as class_name,
                    s.id as section_id, s.name as section_name,
                    sub.name as subject_name,
                    sub.id as subject_id,
                    COUNT(st.id) as student_count
                 FROM teacher_class_assignments tca
                 JOIN classes c ON tca.class_id = c.id
                 JOIN sections s ON tca.section_id = s.id
                 JOIN subjects sub ON tca.subject_id = sub.id
                 LEFT JOIN students st ON st.current_class_id = c.id AND st.section_id = s.id AND st.status = 'active'
                 WHERE tca.teacher_id = (SELECT id FROM teachers WHERE user_id = $1)
                   AND c.school_id = $2
                   ${classTeacherFilter}
                 GROUP BY c.id, c.name, s.id, s.name, sub.name, sub.id, c.numeric_value
                 ORDER BY c.numeric_value, s.name`,
                [userId, schoolId]
            );
        }

        successResponse(res, 'Teacher classes fetched successfully', result.rows);
    } catch (error) {
        console.error('Get teacher classes error:', error);
        errorResponse(res, 'Failed to fetch teacher classes', 500);
    }
};

// Update student roll number (teacher access)
export const updateStudentRollNumber = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId } = req.params;
        const { rollNumber } = req.body;
        const userId = req.user?.userId;

        // Check if teacher has access to this student's class AND is the class teacher
        const accessCheck = await query(
            `SELECT s.id 
             FROM students s
             JOIN teacher_class_assignments tca ON s.current_class_id = tca.class_id AND s.section_id = tca.section_id
             WHERE s.id = $1 
               AND tca.teacher_id = (SELECT id FROM teachers WHERE user_id = $2)
               AND tca.is_class_teacher = true`,
            [studentId, userId]
        );

        if (accessCheck.rows.length === 0) {
            errorResponse(res, 'Access denied. Only the Class Teacher can update roll numbers.', 403);
            return;
        }

        const result = await query(
            `UPDATE students SET roll_number = $1 WHERE id = $2 RETURNING *`,
            [rollNumber, studentId]
        );

        if (result.rowCount === 0) {
            errorResponse(res, 'Student not found', 404);
            return;
        }

        successResponse(res, 'Roll number updated successfully', result.rows[0]);
    } catch (error) {
        console.error('Update roll number error:', error);
        errorResponse(res, 'Failed to update roll number', 500);
    }
};

// Delete teacher (soft delete)
export const deleteTeacher = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await query(
            `UPDATE teachers SET status = 'resigned' WHERE id = $1`,
            [id]
        );

        successResponse(res, 'Teacher removed successfully');
    } catch (error) {
        console.error('Delete teacher error:', error);
        errorResponse(res, 'Failed to delete teacher', 500);
    }
};

// Get teacher dashboard stats
export const getTeacherDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        // Get teacher ID
        const teacherResult = await query('SELECT id FROM teachers WHERE user_id = $1', [userId]);
        if (teacherResult.rows.length === 0) {
            errorResponse(res, 'Teacher profile not found', 404);
            return;
        }
        const teacherId = teacherResult.rows[0].id;

        // 1. Total Classes (Unique classes assigned)
        const classesResult = await query(
            `SELECT COUNT(DISTINCT class_id) as total 
             FROM teacher_class_assignments 
             WHERE teacher_id = $1`,
            [teacherId]
        );

        // 2. Total Students (in assigned classes)
        const studentsResult = await query(
            `SELECT COUNT(DISTINCT s.id) as total
             FROM students s
             JOIN teacher_class_assignments tca ON s.current_class_id = tca.class_id AND s.section_id = tca.section_id
             WHERE tca.teacher_id = $1 AND s.status = 'active'`,
            [teacherId]
        );

        // 3. Today's Schedule (Derived from assignments, mocking times for now as no timetable table)
        const scheduleResult = await query(
            `SELECT 
                c.name as class_name,
                s.name as section_name,
                sub.name as subject_name
             FROM teacher_class_assignments tca
             JOIN classes c ON tca.class_id = c.id
             JOIN sections s ON tca.section_id = s.id
             JOIN subjects sub ON tca.subject_id = sub.id
             WHERE tca.teacher_id = $1
             ORDER BY c.numeric_value, s.name`,
            [teacherId]
        );

        const schedule = scheduleResult.rows.map((row, index) => ({
            id: index + 1,
            period: index + 1,
            class: `${row.class_name}-${row.section_name}`,
            subject: row.subject_name,
            time: `${0 + 8 + index}:00 - ${0 + 8 + index}:45`, // Mock time starting 8:00
            status: 'upcoming' // Default status
        }));

        const stats = {
            totalClasses: parseInt(classesResult.rows[0]?.total || '0'),
            totalStudents: parseInt(studentsResult.rows[0]?.total || '0'),
            todayPeriods: schedule.length,
            leaveBalance: 12, // Mocked
            schedule
        };

        successResponse(res, 'Dashboard stats fetched', stats);
    } catch (error) {
        console.error('Teacher dashboard error:', error);
        errorResponse(res, 'Failed to fetch dashboard stats', 500);
    }
};

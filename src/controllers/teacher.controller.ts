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
                    u.email, u.phone, u.permissions
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
             JOIN classes c ON tca.class_id = c.id
             JOIN sections s ON tca.section_id = s.id
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

            // Auto-generate password from employee ID
            const bcrypt = require('bcryptjs');
            const passwordHash = await bcrypt.hash(employeeId, 12);

            // Create user
            const userResult = await client.query(
                `INSERT INTO users (school_id, email, password_hash, phone, role, permissions)
                 VALUES ($1, $2, $3, $4, 'teacher', $5)
                 RETURNING id`,
                [schoolId, email.toLowerCase(), passwordHash, phone || null, JSON.stringify(permissions || {})]
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
        const { profile, teacher, permissions } = req.body;

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
        });

        successResponse(res, 'Teacher updated successfully');
    } catch (error) {
        console.error('Update teacher error:', error);
        errorResponse(res, 'Failed to update teacher', 500);
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

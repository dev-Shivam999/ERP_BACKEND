import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse, paginate, getTotalPages } from '../utils';

// Get all students with filters
export const getAllStudents = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { classId, sectionId, category, status, search, page = 1, limit = 20 } = req.query;

        const { offset, limit: pageLimit } = paginate(Number(page), Number(limit));

        let whereClause = 'WHERE u.school_id = $1';
        const params: any[] = [schoolId];
        let paramIndex = 2;

        if (classId) {
            whereClause += ` AND s.current_class_id = $${paramIndex++}`;
            params.push(classId);
        }

        if (sectionId) {
            whereClause += ` AND s.section_id = $${paramIndex++}`;
            params.push(sectionId);
        }

        if (category) {
            whereClause += ` AND s.category = $${paramIndex++}`;
            params.push(category);
        }

        if (status) {
            whereClause += ` AND s.status = $${paramIndex++}`;
            params.push(status);
        }

        if (search) {
            whereClause += ` AND (up.first_name ILIKE $${paramIndex} OR up.last_name ILIKE $${paramIndex} OR s.admission_number ILIKE $${paramIndex} OR pup.first_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.relationship = 'father'
       LEFT JOIN parents p ON sp.parent_id = p.id
       LEFT JOIN users pu ON p.user_id = pu.id
       LEFT JOIN user_profiles pup ON pu.id = pup.user_id
       ${whereClause}`,
            params
        );

        const total = parseInt(countResult.rows[0].count);

        // Get students
        params.push(pageLimit, offset);
        const result = await query(
            `SELECT s.id, s.user_id as user_id, s.admission_number, s.roll_number, s.category, s.status,
              s.is_govt_scholarship, s.scholarship_type, s.stream,
              s.previous_school, s.transport_required, s.hostel_required,
              up.first_name, up.last_name, up.photo_url, up.gender, up.date_of_birth,
              u.phone, u.email,u.password_hash,
              c.name as class_name, sec.name as section_name,
              pup.first_name || ' ' || COALESCE(pup.last_name, '') as father_name,
              mup.first_name || ' ' || COALESCE(mup.last_name, '') as mother_name,
              'backend_v2' as api_version
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.relationship = 'father'
       LEFT JOIN parents fp ON sp.parent_id = fp.id
       LEFT JOIN users pu ON fp.user_id = pu.id
       LEFT JOIN user_profiles pup ON pu.id = pup.user_id
       LEFT JOIN student_parents msp ON s.id = msp.student_id AND msp.relationship = 'mother'
       LEFT JOIN parents mp ON msp.parent_id = mp.id
       LEFT JOIN users mu ON mp.user_id = mu.id
       LEFT JOIN user_profiles mup ON mu.id = mup.user_id
       ${whereClause}
       ORDER BY c.numeric_value, sec.name, s.roll_number
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        if (result.rows.length > 0) {
            console.log('DEBUG: First student fetched:', {
                id: result.rows[0].id,
                user_id: result.rows[0].user_id,
                api_version: result.rows[0].api_version
            });
        }

        successResponse(res, 'Students fetched successfully', result.rows, 200, {
            page: Number(page),
            limit: pageLimit,
            total,
            totalPages: getTotalPages(total, pageLimit),
        });
    } catch (error) {
        console.error('Get students error:', error);
        errorResponse(res, 'Failed to fetch students', 500);
    }
};

// Get student by ID
export const getStudentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT s.*, up.first_name, up.last_name, up.gender, up.date_of_birth,
              up.address, up.city, up.state, up.pincode, up.photo_url,
              up.aadhar_number, up.blood_group, u.email, u.phone,
              c.name as class_name, sec.name as section_name,
              ac.name as admission_class_name,
              fup.first_name as father_name,
              mup.first_name as mother_name,
              gup.first_name as guardian_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN classes ac ON s.admission_class_id = ac.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_parents fsp ON s.id = fsp.student_id AND fsp.relationship = 'father'
       LEFT JOIN parents fp ON fsp.parent_id = fp.id
       LEFT JOIN user_profiles fup ON fp.user_id = fup.user_id
       LEFT JOIN student_parents msp ON s.id = msp.student_id AND msp.relationship = 'mother'
       LEFT JOIN parents mp ON msp.parent_id = mp.id
       LEFT JOIN user_profiles mup ON mp.user_id = mup.user_id
       LEFT JOIN student_parents gsp ON s.id = gsp.student_id AND gsp.relationship = 'guardian'
       LEFT JOIN parents gp ON gsp.parent_id = gp.id
       LEFT JOIN user_profiles gup ON gp.user_id = gup.user_id
       WHERE s.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Student not found', 404);
            return;
        }

        // Get parents
        const parentsResult = await query(
            `SELECT p.*, up.first_name, up.last_name, u.phone, u.email, sp.relationship, sp.is_primary_contact
       FROM student_parents sp
       JOIN parents p ON sp.parent_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE sp.student_id = $1`,
            [id]
        );

        successResponse(res, 'Student fetched successfully', {
            ...result.rows[0],
            parents: parentsResult.rows,
        });
    } catch (error) {
        console.error('Get student error:', error);
        errorResponse(res, 'Failed to fetch student', 500);
    }
};

// Create new student
export const createStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const {
            firstName, middleName, lastName,
            email, phone, alternatePhone,
            joiningClass, currentClass, className, sectionName,
            stream, // For class 11/12
            category, religion,
            fatherName, motherName, guardianName, guardianRelation,
            dateOfBirth, gender, bloodGroup, aadharNumber,
            address, city, state, pincode,
            previousSchool, transferCertificateNo, admissionDate,
            isGovtScholarship, scholarshipType,
            transportRequired, hostelRequired
        } = req.body;

        const result = await transaction(async (client) => {
            // Generate admission number
            const year = new Date().getFullYear();
            const admissionResult = await client.query(
                `SELECT sp_generate_student_id($1, $2) as admission_number`,
                [schoolId, year]
            );
            const admissionNumber = admissionResult.rows[0].admission_number;

            // Auto-generate password from admission number
            const bcrypt = require('bcryptjs');
            const defaultPassword = admissionNumber;
            const passwordHash = await bcrypt.hash(defaultPassword, 12);

            // Generate email if not provided
            const userEmail = email || `${admissionNumber.toLowerCase()}@student.school.local`;

            // Create user
            const userResult = await client.query(
                `INSERT INTO users (school_id, email, password_hash, phone, role)
                 VALUES ($1, $2, $3, $4, 'student')
                 RETURNING id`,
                [schoolId, userEmail.toLowerCase(), passwordHash, phone || null]
            );
            const userId = userResult.rows[0].id;

            // Create profile with all details
            await client.query(
                `INSERT INTO user_profiles (user_id, first_name, last_name, gender, date_of_birth, blood_group, aadhar_number, address, city, state, pincode)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [userId, firstName, lastName || '', gender || null, dateOfBirth || null, bloodGroup || null, aadharNumber || null, address || null, city || null, state || null, pincode || null]
            );

            // Determine class name (currentClass takes priority, then className)
            const actualClassName = currentClass || className;

            // Find or create class
            let classId;
            const classResult = await client.query(
                `SELECT id FROM classes WHERE school_id = $1 AND name = $2`,
                [schoolId, actualClassName]
            );
            if (classResult.rows.length > 0) {
                classId = classResult.rows[0].id;
            } else {
                // Parse numeric value from class name
                let numericValue = 0;
                if (actualClassName.toLowerCase().includes('nursery')) numericValue = -2;
                else if (actualClassName.toLowerCase().includes('lkg')) numericValue = -1;
                else if (actualClassName.toLowerCase().includes('ukg')) numericValue = 0;
                else {
                    const match = actualClassName.match(/\d+/);
                    if (match) numericValue = parseInt(match[0]);
                }

                const newClass = await client.query(
                    `INSERT INTO classes (school_id, name, numeric_value, display_order)
                     VALUES ($1, $2, $3, $3) RETURNING id`,
                    [schoolId, actualClassName, numericValue]
                );
                classId = newClass.rows[0].id;
            }

            // Find or create joining class (if different from current)
            let admissionClassId = classId;
            if (joiningClass && joiningClass !== actualClassName) {
                const jClassResult = await client.query(
                    `SELECT id FROM classes WHERE school_id = $1 AND name = $2`,
                    [schoolId, joiningClass]
                );
                if (jClassResult.rows.length > 0) {
                    admissionClassId = jClassResult.rows[0].id;
                }
            }

            // Find or create section
            let sectionId;
            const sectionResult = await client.query(
                `SELECT id FROM sections WHERE class_id = $1 AND name = $2`,
                [classId, sectionName || 'A']
            );
            if (sectionResult.rows.length > 0) {
                sectionId = sectionResult.rows[0].id;
            } else {
                const newSection = await client.query(
                    `INSERT INTO sections (class_id, name) VALUES ($1, $2) RETURNING id`,
                    [classId, sectionName || 'A']
                );
                sectionId = newSection.rows[0].id;
            }

            // Create student with all fields
            const studentResult = await client.query(
                `INSERT INTO students (
                    user_id, admission_number, admission_class_id, current_class_id, section_id,
                    religion, category, stream, previous_school, transfer_certificate_no,
                    is_govt_scholarship, scholarship_type, transport_required, hostel_required,
                    admission_date
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id`,
                [
                    userId, admissionNumber, admissionClassId, classId, sectionId,
                    religion || null, category || 'general', stream || null,
                    previousSchool || null, transferCertificateNo || null,
                    isGovtScholarship || false, scholarshipType || null,
                    transportRequired || false, hostelRequired || false,
                    admissionDate || new Date()
                ]
            );

            // Create parent records if names provided
            const createParent = async (name: string, relationship: string, isPrimary: boolean = false) => {
                if (!name) return null;
                const bcrypt = require('bcryptjs');
                const passwordHash = await bcrypt.hash('parent123', 12);
                const parentEmail = `${relationship}.${admissionNumber.toLowerCase()}@school.local`;
                const parentUser = await client.query(
                    `INSERT INTO users (school_id, email, password_hash, role) VALUES ($1, $2, $3, 'parent') RETURNING id`,
                    [schoolId, parentEmail, passwordHash]
                );
                const pUserId = parentUser.rows[0].id;

                await client.query(
                    `INSERT INTO user_profiles (user_id, first_name) VALUES ($1, $2)`,
                    [pUserId, name]
                );

                const pResult = await client.query(
                    `INSERT INTO parents (user_id) VALUES ($1) RETURNING id`,
                    [pUserId]
                );
                const pId = pResult.rows[0].id;

                await client.query(
                    `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary_contact)
                     VALUES ($1, $2, $3, $4)`,
                    [studentResult.rows[0].id, pId, relationship, isPrimary]
                );
                return pId;
            };

            await createParent(fatherName, 'father', true);
            await createParent(motherName, 'mother', false);
            if (guardianName && guardianName !== fatherName && guardianName !== motherName) {
                await createParent(guardianName, 'guardian', false);
            }

            return {
                id: studentResult.rows[0].id,
                admissionNumber,
                userId,
                defaultPassword: admissionNumber,
            };
        });

        successResponse(res, 'Student created successfully', result, 201);
    } catch (error: any) {
        console.error('Create student error:', error);

        // Handle unique constraint violations (PostgreSQL error code 23505)
        if (error.code === '23505') {
            const detail = error.detail || '';
            let message = 'A student with these unique details already exists.';

            if (detail.includes('admission_number')) {
                message = 'Student with this Admission Number already exists.';
            } else if (detail.includes('email')) {
                message = 'Email address is already in use by another user.';
            } else if (detail.includes('phone')) {
                message = 'Phone number is already in use by another user.';
            } else if (detail.includes('aadhar_number')) {
                message = 'Aadhar Number already exists in the system.';
            }

            errorResponse(res, message, 400);
            return;
        }

        errorResponse(res, 'Failed to create student. Please check all fields.', 500);
    }
};


// Update student
export const updateStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = req.body;
        const schoolId = req.user?.schoolId;

        await transaction(async (client) => {
            // Find class ID if name provided
            let classId;
            if (data.currentClass) {
                const classResult = await client.query(
                    'SELECT id FROM classes WHERE name = $1 AND school_id = $2',
                    [data.currentClass, schoolId]
                );
                if (classResult.rows.length > 0) classId = classResult.rows[0].id;
            }

            // Find section ID if name provided
            let sectionId;
            if (data.sectionName && (classId || true)) {
                // If classId not provided, use existing class of student
                const studentClassId = classId || (await client.query('SELECT current_class_id FROM students WHERE id = $1', [id])).rows[0]?.current_class_id;
                if (studentClassId) {
                    const sectionResult = await client.query(
                        'SELECT id FROM sections WHERE name = $1 AND class_id = $2',
                        [data.sectionName, studentClassId]
                    );
                    if (sectionResult.rows.length > 0) sectionId = sectionResult.rows[0].id;
                }
            }

            // Update student
            await client.query(
                `UPDATE students SET
          current_class_id = COALESCE($2, current_class_id),
          section_id = COALESCE($3, section_id),
          roll_number = COALESCE($4, roll_number),
          category = COALESCE($5, category),
          religion = COALESCE($6, religion),
          stream = COALESCE($7, stream),
          previous_school = COALESCE($8, previous_school),
          transfer_certificate_no = COALESCE($9, transfer_certificate_no),
          is_govt_scholarship = COALESCE($10, is_govt_scholarship),
          scholarship_type = COALESCE($11, scholarship_type),
          transport_required = COALESCE($12, transport_required),
          hostel_required = COALESCE($13, hostel_required),
          admission_date = COALESCE($14, admission_date),
          status = COALESCE($15, status),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
                [
                    id,
                    classId, sectionId, data.rollNumber,
                    data.category, data.religion, data.stream,
                    data.previousSchool, data.transferCertificateNo,
                    data.isGovtScholarship, data.scholarshipType,
                    data.transportRequired, data.hostelRequired,
                    data.admissionDate,
                    data.status
                ]
            );

            // Update profile
            const studentData = await client.query('SELECT user_id, admission_number FROM students WHERE id = $1', [id]);
            if (studentData.rows.length > 0) {
                const userId = studentData.rows[0].user_id;
                const admissionNumber = studentData.rows[0].admission_number;

                await client.query(
                    `UPDATE user_profiles SET
            first_name = COALESCE($2, first_name),
            last_name = COALESCE($3, last_name),
            gender = COALESCE($4, gender),
            date_of_birth = COALESCE($5, date_of_birth),
            blood_group = COALESCE($6, blood_group),
            aadhar_number = COALESCE($7, aadhar_number),
            address = COALESCE($8, address),
            city = COALESCE($9, city),
            state = COALESCE($10, state),
            pincode = COALESCE($11, pincode),
            updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
                    [
                        userId,
                        data.firstName, data.lastName, data.gender || null,
                        data.dateOfBirth || null, data.bloodGroup || null, data.aadharNumber || null,
                        data.address || null, data.city || null, data.state || null, data.pincode || null
                    ]
                );

                // Update phone in users table
                if (data.phone) {
                    await client.query(
                        `UPDATE users SET phone = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                        [userId, data.phone]
                    );
                }

                // Handle Parent updates (Father/Mother/Guardian)
                const updateParent = async (name: string, relationship: string) => {
                    if (!name) return;

                    // Check if parent exists
                    const existingParent = await client.query(
                        `SELECT p.id, up.user_id 
                         FROM student_parents sp
                         JOIN parents p ON sp.parent_id = p.id
                         JOIN users u ON p.user_id = u.id
                         JOIN user_profiles up ON u.id = up.user_id
                         WHERE sp.student_id = $1 AND sp.relationship = $2`,
                        [id, relationship]
                    );

                    if (existingParent.rows.length > 0) {
                        // Update existing
                        await client.query(
                            `UPDATE user_profiles SET first_name = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
                            [existingParent.rows[0].user_id, name]
                        );
                    } else {
                        // Create new
                        const bcrypt = require('bcryptjs');
                        const passwordHash = await bcrypt.hash('parent123', 12);
                        const parentEmail = `${relationship}.${admissionNumber.toLowerCase()}@school.local`;
                        const parentUser = await client.query(
                            `INSERT INTO users (school_id, email, password_hash, role) VALUES ($1, $2, $3, 'parent') RETURNING id`,
                            [schoolId, parentEmail, passwordHash]
                        );
                        const parentUserId = parentUser.rows[0].id;
                        await client.query(
                            `INSERT INTO user_profiles (user_id, first_name) VALUES ($1, $2)`,
                            [parentUserId, name]
                        );
                        const parentRecord = await client.query(
                            `INSERT INTO parents (user_id) VALUES ($1) RETURNING id`,
                            [parentUserId]
                        );
                        await client.query(
                            `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary_contact)
                             VALUES ($1, $2, $3, $4)`,
                            [id, parentRecord.rows[0].id, relationship, relationship === 'father']
                        );
                    }
                };

                await updateParent(data.fatherName, 'father');
                await updateParent(data.motherName, 'mother');
                await updateParent(data.guardianName, 'guardian');
            }
        });

        // Fetch updated student data to return
        const updatedStudent = await query(
            `SELECT s.id, s.admission_number, s.roll_number, s.category, s.status,
              s.is_govt_scholarship, s.scholarship_type, s.stream,
              s.previous_school, s.transport_required, s.hostel_required,
              up.first_name, up.last_name, up.photo_url, up.gender, up.date_of_birth,
              u.phone, u.email,
              c.name as class_name, sec.name as section_name,
              pup.first_name || ' ' || COALESCE(pup.last_name, '') as father_name,
              mup.first_name || ' ' || COALESCE(mup.last_name, '') as mother_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.relationship = 'father'
       LEFT JOIN parents p ON sp.parent_id = p.id
       LEFT JOIN users pu ON p.user_id = pu.id
       LEFT JOIN user_profiles pup ON pu.id = pup.user_id
       LEFT JOIN student_parents msp ON s.id = msp.student_id AND msp.relationship = 'mother'
       LEFT JOIN parents mp ON msp.parent_id = mp.id
       LEFT JOIN users mu ON mp.user_id = mu.id
       LEFT JOIN user_profiles mup ON mu.id = mup.user_id
       WHERE s.id = $1`,
            [id]
        );

        successResponse(res, 'Student updated successfully', updatedStudent.rows[0]);
    } catch (error: any) {
        console.error('Update student error:', error);

        if (error.code === '23505') {
            const detail = error.detail || '';
            let message = 'A student with these unique details already exists.';

            if (detail.includes('admission_number')) {
                message = 'Student with this Admission Number already exists.';
            } else if (detail.includes('email')) {
                message = 'Email address is already in use by another user.';
            } else if (detail.includes('phone')) {
                message = 'Phone number is already in use by another user.';
            } else if (detail.includes('aadhar_number')) {
                message = 'Aadhar Number already exists in the system.';
            }

            errorResponse(res, message, 400);
            return;
        }

        errorResponse(res, 'Failed to update student', 500);
    }
};


// Delete student
export const deleteStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Soft delete - update status to 'left'
        await query(
            `UPDATE students SET status = 'left', leaving_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );

        successResponse(res, 'Student removed successfully');
    } catch (error) {
        console.error('Delete student error:', error);
        errorResponse(res, 'Failed to delete student', 500);
    }
};

// Promote students
export const promoteStudents = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { fromClassId, toClassId, toSectionId, academicYear } = req.body;

        const result = await query(
            `SELECT * FROM sp_promote_students($1, $2, $3, $4, $5)`,
            [fromClassId, toClassId, toSectionId, academicYear, userId]
        );

        successResponse(res, 'Students promoted successfully', result.rows[0]);
    } catch (error) {
        console.error('Promote students error:', error);
        errorResponse(res, 'Failed to promote students', 500);
    }
};

// Get student documents
export const getStudentDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT sd.*, up.first_name || ' ' || up.last_name as verified_by_name
       FROM student_documents sd
       LEFT JOIN users u ON sd.verified_by = u.id
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE sd.student_id = $1
       ORDER BY sd.uploaded_at DESC`,
            [id]
        );

        successResponse(res, 'Documents fetched successfully', result.rows);
    } catch (error) {
        console.error('Get documents error:', error);
        errorResponse(res, 'Failed to fetch documents', 500);
    }
};

// Upload document
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { documentType, documentNumber, documentUrl, documentName } = req.body;

        const result = await query(
            `INSERT INTO student_documents (student_id, document_type, document_number, document_url, document_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
            [id, documentType, documentNumber, documentUrl, documentName]
        );

        successResponse(res, 'Document uploaded successfully', { documentId: result.rows[0].id }, 201);
    } catch (error) {
        console.error('Upload document error:', error);
        errorResponse(res, 'Failed to upload document', 500);
    }
};
// Get logged-in student profile
export const getStudentProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;

        // First get the student ID for this user
        const studentIdResult = await query(
            `SELECT id FROM students WHERE user_id = $1`,
            [userId]
        );

        if (studentIdResult.rows.length === 0) {
            errorResponse(res, 'Student profile not found', 404);
            return;
        }

        const studentId = studentIdResult.rows[0].id;

        // Use the same query as getStudentById
        const result = await query(
            `SELECT s.*, up.first_name, up.last_name, up.gender, up.date_of_birth,
              up.address, up.city, up.state, up.pincode, up.photo_url,
              up.aadhar_number, up.blood_group, 
              u.email as email, u.phone as phone,
              c.name as class_name, sec.name as section_name,
              ac.name as admission_class_name,
              fup.first_name as father_name,
              mup.first_name as mother_name,
              gup.first_name as guardian_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN classes ac ON s.admission_class_id = ac.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_parents fsp ON s.id = fsp.student_id AND fsp.relationship = 'father'
       LEFT JOIN parents fp ON fsp.parent_id = fp.id
       LEFT JOIN user_profiles fup ON fp.user_id = fup.user_id
       LEFT JOIN student_parents msp ON s.id = msp.student_id AND msp.relationship = 'mother'
       LEFT JOIN parents mp ON msp.parent_id = mp.id
       LEFT JOIN user_profiles mup ON mp.user_id = mup.user_id
       LEFT JOIN student_parents gsp ON s.id = gsp.student_id AND gsp.relationship = 'guardian'
       LEFT JOIN parents gp ON gsp.parent_id = gp.id
       LEFT JOIN user_profiles gup ON gp.user_id = gup.user_id
       WHERE s.id = $1 AND u.school_id = $2`,
            [studentId, schoolId]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Student profile not found', 404);
            return;
        }

        // Get parents
        const parentsResult = await query(
            `SELECT p.*, up.first_name, up.last_name, u.phone, u.email, sp.relationship, sp.is_primary_contact
       FROM student_parents sp
       JOIN parents p ON sp.parent_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE sp.student_id = $1`,
            [studentId]
        );

        successResponse(res, 'Profile fetched', {
            ...result.rows[0],
            parents: parentsResult.rows,
        });
    } catch (error) {
        console.error('Get student profile error:', error);
        errorResponse(res, 'Failed to fetch profile', 500);
    }
};

// Get teachers for the student
export const getStudentTeachers = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        // 1. Get student's class/section
        const studentRes = await query(
            `SELECT current_class_id, section_id FROM students WHERE user_id = $1`,
            [userId]
        );

        if (studentRes.rows.length === 0) {
            errorResponse(res, 'Student not found', 404);
            return;
        }

        const { current_class_id, section_id } = studentRes.rows[0];

        // 2. Fetch assigned teachers
        const teachersRes = await query(
            `SELECT 
                t.id, t.employee_id,
                up.first_name, up.last_name, up.photo_url,
                u.email, u.phone,
                s.name as subject_name,
                tca.is_class_teacher
             FROM teacher_class_assignments tca
             JOIN teachers t ON tca.teacher_id = t.id
             JOIN users u ON t.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN subjects s ON tca.subject_id = s.id
             WHERE tca.class_id = $1 AND tca.section_id = $2
             ORDER BY tca.is_class_teacher DESC, s.name ASC`,
            [current_class_id, section_id]
        );

        successResponse(res, 'Teachers fetched', teachersRes.rows);
    } catch (error) {
        console.error('Get student teachers error:', error);
        errorResponse(res, 'Failed to fetch teachers', 500);
    }
};

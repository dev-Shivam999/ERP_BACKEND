import { Request, Response } from 'express';
import { query, transaction } from '../config';
import { successResponse, errorResponse } from '../utils';

// Get student fee details
export const getStudentFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId } = req.params;

        // Get student info
        const studentResult = await query(
            `SELECT s.admission_number, s.category, s.is_govt_scholarship, s.scholarship_type,
              s.govt_fee_concession_percent,
              up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
              c.name as class_name, sec.name as section_name,
              c.monthly_fee_amount as expected_monthly_fee
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       WHERE s.id = $1`,
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            errorResponse(res, 'Student not found', 404);
            return;
        }

        // Get fee details
        const feesResult = await query(
            `SELECT sf.*, ft.name as fee_type_name, sf.month as period_month, sf.year as period_year
       FROM student_fees sf
       LEFT JOIN fee_structures fs ON sf.fee_structure_id = fs.id
       LEFT JOIN fee_types ft ON fs.fee_type_id = ft.id
       WHERE sf.student_id = $1
       ORDER BY sf.year DESC, sf.month DESC, sf.created_at DESC`,
            [studentId]
        );

        // Calculate totals
        const totals = feesResult.rows.reduce(
            (acc, fee) => ({
                totalDue: acc.totalDue + parseFloat(fee.amount_due),
                totalPaid: acc.totalPaid + parseFloat(fee.amount_paid),
                totalPending: acc.totalPending + parseFloat(fee.amount_pending),
            }),
            { totalDue: 0, totalPaid: 0, totalPending: 0 }
        );

        // Fallback for totals if no fees recorded yet
        if (feesResult.rows.length === 0 && studentResult.rows[0]) {
            const student = studentResult.rows[0];
            // In a real scenario, we might want to check the class monthly fee
            // For now, let's at least ensure we don't just return 0 if the student is active
            // The getPendingFees already has some logic for this, let's align.
            // But getStudentFees is more specific.
        }

        successResponse(res, 'Student fees fetched', {
            student: studentResult.rows[0],
            fees: feesResult.rows,
            totals: feesResult.rows.length > 0 ? totals : {
                totalDue: parseFloat(studentResult.rows[0].expected_monthly_fee || 0),
                totalPaid: 0,
                totalPending: parseFloat(studentResult.rows[0].expected_monthly_fee || 0)
            },
        });
    } catch (error) {
        console.error('Get student fees error:', error);
        errorResponse(res, 'Failed to fetch fees', 500);
    }
};

// Get current student's fees (for mobile app)
export const getMyFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        // Find student ID from user ID
        const studentData = await query('SELECT id FROM students WHERE user_id = $1', [userId]);
        if (studentData.rows.length === 0) {
            errorResponse(res, 'Student record not found', 404);
            return;
        }

        const studentId = studentData.rows[0].id;

        // Wrap the rest in a way that reuses getStudentFees logic behaviorally
        req.params.studentId = studentId;
        return getStudentFees(req, res);
    } catch (error) {
        console.error('Get my fees error:', error);
        errorResponse(res, 'Failed to fetch your fees', 500);
    }
};

// Collect fee payment
export const collectFee = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const schoolId = req.user?.schoolId;
        const { studentId, studentFeeIds, amount, paymentMode, chequeNumber, chequeDate, bankName, transactionId, remarks } = req.body;

        const result = await transaction(async (client) => {
            // Generate receipt number
            const year = new Date().getFullYear();
            const receiptResult = await client.query(
                `SELECT sp_generate_receipt_number($1::uuid, $2::integer) as receipt_number`,
                [schoolId, year]
            );

            const receiptNumber = receiptResult.rows[0].receipt_number;

            let remainingAmount = amount;
            const payments = [];

            let feeIdsToProcess = studentFeeIds;
            if (!feeIdsToProcess || feeIdsToProcess.length === 0) {
                const pendingResult = await client.query(
                    `SELECT id FROM student_fees 
                     WHERE student_id = $1 AND status != 'paid' 
                     ORDER BY year ASC, month ASC, due_date ASC`,
                    [studentId]
                );

                if (pendingResult.rows.length > 0) {
                    feeIdsToProcess = pendingResult.rows.map(r => r.id);
                } else {
                    // Try to generate a fee record for the requested month/year
                    const payMonth = req.body.month ? parseInt(req.body.month.split('-')[1]) : new Date().getMonth() + 1;
                    const payYear = req.body.month ? parseInt(req.body.month.split('-')[0]) : new Date().getFullYear();
                    const feeTypeName = req.body.feeType || 'tuition';

                    // Find student class and current academic year
                    const studentInfo = await client.query(
                        `SELECT s.current_class_id, ay.id as academic_year_id 
                         FROM students s
                         JOIN users u ON s.user_id = u.id
                         JOIN academic_years ay ON ay.school_id = u.school_id AND ay.is_current = true
                         WHERE s.id = $1`,
                        [studentId]
                    );

                    if (studentInfo.rows.length > 0) {
                        const { current_class_id, academic_year_id } = studentInfo.rows[0];

                        // Find matching fee structure
                        const structResult = await client.query(
                            `SELECT fs.id, fs.amount 
                             FROM fee_structures fs
                             JOIN fee_types ft ON fs.fee_type_id = ft.id
                             WHERE fs.class_id = $1 AND fs.academic_year_id = $2 AND ft.name ILIKE $3`,
                            [current_class_id, academic_year_id, `%${feeTypeName}%`]
                        );

                        if (structResult.rows.length > 0) {
                            const struct = structResult.rows[0];
                            // Create the fee record
                            const createResult = await client.query(
                                `INSERT INTO student_fees (student_id, fee_structure_id, month, year, original_amount, amount_due, amount_pending, due_date, status)
                                 VALUES ($1, $2, $3, $4, $5, $5, $5, $6, 'pending')
                                 RETURNING id`,
                                [studentId, struct.id, payMonth, payYear, struct.amount, `${payYear}-${payMonth}-10`]
                            );
                            feeIdsToProcess = [createResult.rows[0].id];
                        } else {
                            // Fallback to class monthly_fee_amount
                            const classResult = await client.query(`SELECT monthly_fee_amount FROM classes WHERE id = $1`, [current_class_id]);
                            const amount = classResult.rows[0]?.monthly_fee_amount || 0;

                            throw new Error(`No fee structure found for ${feeTypeName} in this class. Please configure fee structures.`);
                        }
                    }
                }
            }

            // If still no fees found, we can't record a payment against nothing.
            if (!feeIdsToProcess || feeIdsToProcess.length === 0) {
                throw new Error('No pending fees found and could not generate one. Please ensure fee structures are configured.');
            }

            // Process each fee
            for (const feeId of feeIdsToProcess) {
                if (remainingAmount <= 0) break;

                // Get fee details
                const feeResult = await client.query(
                    `SELECT * FROM student_fees WHERE id = $1`,
                    [feeId]
                );

                if (feeResult.rows.length === 0) continue;

                const fee = feeResult.rows[0];
                const payAmount = Math.min(remainingAmount, parseFloat(fee.amount_pending));

                // Create payment record
                await client.query(
                    `INSERT INTO fee_payments (student_fee_id, receipt_number, amount_paid, payment_mode, payment_date, 
                                     cheque_number, cheque_date, bank_name, transaction_id, collected_by, remarks)
                     VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, $9, $10)`,
                    [feeId, receiptNumber, payAmount, paymentMode, chequeNumber, chequeDate, bankName, transactionId, userId, remarks]
                );

                // Update fee record
                const newPaid = parseFloat(fee.amount_paid) + payAmount;
                const newPending = parseFloat(fee.amount_due) - newPaid;
                const newStatus = newPending <= 0 ? 'paid' : 'partial';

                await client.query(
                    `UPDATE student_fees SET amount_paid = $2, amount_pending = $3, status = $4
                     WHERE id = $1`,
                    [feeId, newPaid, newPending, newStatus]
                );

                payments.push({ feeId, amount: payAmount });
                remainingAmount -= payAmount;
            }

            // Send notification to parent
            await client.query(
                `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
         SELECT u.school_id,
                'Fees Received / फीस प्राप्त',
                'फीस ₹' || $2 || ' प्राप्त हुई। Receipt No: ' || $3,
                'fee_receipt', 'normal', 'individual',
                jsonb_build_array(p.user_id),
                $4
         FROM students s
         JOIN users u ON s.user_id = u.id
         JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
         JOIN parents p ON sp.parent_id = p.id
         WHERE s.id = $1`,
                [studentId, amount, receiptNumber, userId]
            );

            return { receiptNumber, payments, totalCollected: amount - remainingAmount };
        });

        successResponse(res, 'Payment collected successfully', result, 201);
    } catch (error: any) {
        console.error('Collect fee error:', error);
        errorResponse(res, error.message || 'Failed to collect fee', 500);
    }
};

// Get fee receipt
export const getReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiptNumber } = req.params;

        const result = await query(
            `SELECT fp.*, sf.month, sf.year, sf.amount_due,
              s.admission_number, up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
              c.name as class_name, sec.name as section_name,
              pup.first_name || ' ' || COALESCE(pup.last_name, '') as father_name,
              cup.first_name || ' ' || COALESCE(cup.last_name, '') as collected_by_name,
              sch.name as school_name, sch.address as school_address
       FROM fee_payments fp
       JOIN student_fees sf ON fp.student_fee_id = sf.id
       JOIN students s ON sf.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       JOIN schools sch ON u.school_id = sch.id
       LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.relationship = 'father'
       LEFT JOIN parents p ON sp.parent_id = p.id
       LEFT JOIN users pu ON p.user_id = pu.id
       LEFT JOIN user_profiles pup ON pu.id = pup.user_id
       JOIN users cu ON fp.collected_by = cu.id
       JOIN user_profiles cup ON cu.id = cup.user_id
       WHERE fp.receipt_number = $1`,
            [receiptNumber]
        );

        if (result.rows.length === 0) {
            errorResponse(res, 'Receipt not found', 404);
            return;
        }

        successResponse(res, 'Receipt fetched', result.rows[0]);
    } catch (error) {
        console.error('Get receipt error:', error);
        errorResponse(res, 'Failed to fetch receipt', 500);
    }
};

// Get pending fees list
export const getPendingFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { classId, search } = req.query;

        let whereClause = 'WHERE u.school_id = $1 AND s.status = \'active\'';
        const params: any[] = [schoolId];
        let paramIndex = 2;

        if (classId) {
            whereClause += ` AND s.current_class_id = $${paramIndex++}`;
            params.push(classId);
        }

        if (search) {
            whereClause += ` AND (up.first_name ILIKE $${paramIndex} OR up.last_name ILIKE $${paramIndex} OR s.admission_number ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const result = await query(
            `SELECT s.id as student_id, s.admission_number,
              up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
              c.name as class_name, sec.name as section_name,
              c.monthly_fee_amount as expected_monthly_fee,
              COALESCE(SUM(sf.amount_paid), 0) as total_paid,
              CASE 
                WHEN COUNT(sf.id) > 0 THEN SUM(sf.amount_due)
                ELSE c.monthly_fee_amount
              END as total_due,
              CASE 
                WHEN COUNT(sf.id) > 0 THEN SUM(sf.amount_pending)
                ELSE c.monthly_fee_amount
              END as total_pending
       FROM students s
       JOIN users u ON s.user_id = u.id
       JOIN user_profiles up ON u.id = up.user_id
       JOIN classes c ON s.current_class_id = c.id
       JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN student_fees sf ON s.id = sf.student_id
       ${whereClause}
       GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name, c.monthly_fee_amount
       ORDER BY total_pending DESC, student_name ASC`,
            params
        );

        // Get aggregate stats for summary cards
        // Using independent queries or subqueries to ensure accuracy regardless of filters
        const summaryResult = await query(
            `SELECT 
                (SELECT COALESCE(SUM(fp.amount_paid), 0) FROM fee_payments fp 
                 JOIN student_fees sf ON fp.student_fee_id = sf.id 
                 JOIN students s ON sf.student_id = s.id 
                 JOIN users u ON s.user_id = u.id 
                 WHERE u.school_id = $1 AND fp.payment_date = CURRENT_DATE) as today_collection,
                
                (SELECT COALESCE(SUM(fp.amount_paid), 0) FROM fee_payments fp 
                 JOIN student_fees sf ON fp.student_fee_id = sf.id 
                 JOIN students s ON sf.student_id = s.id 
                 JOIN users u ON s.user_id = u.id 
                 WHERE u.school_id = $1) as total_collected_year,
                
                (SELECT 
                    (SELECT COALESCE(SUM(sf_sum.amount_pending), 0) 
                     FROM student_fees sf_sum 
                     JOIN students s_sum ON sf_sum.student_id = s_sum.id 
                     JOIN users u_sum ON s_sum.user_id = u_sum.id 
                     WHERE u_sum.school_id = $1 AND s_sum.status = 'active') 
                    +
                    (SELECT COALESCE(SUM(c_sum.monthly_fee_amount), 0) 
                     FROM students s_sum2
                     JOIN users u_sum2 ON s_sum2.user_id = u_sum2.id
                     JOIN classes c_sum ON s_sum2.current_class_id = c_sum.id
                     WHERE u_sum2.school_id = $1 AND s_sum2.status = 'active'
                     AND NOT EXISTS (SELECT 1 FROM student_fees sf_exist WHERE sf_exist.student_id = s_sum2.id))
                ) as total_pending_all`,
            [schoolId]
        );

        successResponse(res, 'Pending fees fetched', {
            students: result.rows,
            summary: summaryResult.rows[0]
        });
    } catch (error) {
        console.error('Get pending fees error:', error);
        errorResponse(res, 'Failed to fetch pending fees', 500);
    }
};

// Get fee defaulters
export const getDefaulters = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        // Query directly instead of using view
        const result = await query(
            `SELECT s.id as student_id, s.admission_number,
                up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                c.name as class_name, sec.name as section_name,
                SUM(sf.amount_pending) as total_pending,
                MIN(sf.due_date) as oldest_due_date,
                CURRENT_DATE - MIN(sf.due_date) as days_overdue
             FROM student_fees sf
             JOIN students s ON sf.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             WHERE u.school_id = $1 
               AND s.status = 'active'
               AND sf.amount_pending > 0 
               AND sf.due_date < CURRENT_DATE
             GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name
             ORDER BY days_overdue DESC`,
            [schoolId]
        );

        successResponse(res, 'Defaulters list fetched', result.rows);
    } catch (error) {
        console.error('Get defaulters error:', error);
        errorResponse(res, 'Failed to fetch defaulters', 500);
    }
};

// Get daily collection report
export const getDailyCollection = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { date } = req.query;

        const targetDate = date || new Date().toISOString().split('T')[0];

        // Query directly instead of using view
        const result = await query(
            `SELECT 
                fp.payment_date,
                COUNT(*) as total_transactions,
                COALESCE(SUM(fp.amount_paid), 0) as total,
                COALESCE(SUM(CASE WHEN fp.payment_mode = 'cash' THEN fp.amount_paid ELSE 0 END), 0) as cash,
                COALESCE(SUM(CASE WHEN fp.payment_mode IN ('upi', 'online') THEN fp.amount_paid ELSE 0 END), 0) as online,
                COALESCE(SUM(CASE WHEN fp.payment_mode = 'cheque' THEN fp.amount_paid ELSE 0 END), 0) as cheque
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             JOIN students s ON sf.student_id = s.id
             JOIN users u ON s.user_id = u.id
             WHERE u.school_id = $1 AND fp.payment_date = $2
             GROUP BY fp.payment_date`,
            [schoolId, targetDate]
        );

        successResponse(res, 'Daily collection fetched', result.rows[0] || {
            payment_date: targetDate,
            total_transactions: 0,
            total: 0,
            cash: 0,
            online: 0,
            cheque: 0,
        });
    } catch (error) {
        console.error('Get daily collection error:', error);
        errorResponse(res, 'Failed to fetch collection', 500);
    }
};

// Get monthly collection report
export const getMonthlyCollection = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { month, year } = req.query;

        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        // Query directly instead of using view
        const result = await query(
            `SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(fp.amount_paid), 0) as total,
                COALESCE(SUM(CASE WHEN fp.payment_mode = 'cash' THEN fp.amount_paid ELSE 0 END), 0) as cash,
                COALESCE(SUM(CASE WHEN fp.payment_mode IN ('upi', 'online') THEN fp.amount_paid ELSE 0 END), 0) as online,
                COALESCE(SUM(CASE WHEN fp.payment_mode = 'cheque' THEN fp.amount_paid ELSE 0 END), 0) as cheque
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             JOIN students s ON sf.student_id = s.id
             JOIN users u ON s.user_id = u.id
             WHERE u.school_id = $1 
               AND EXTRACT(MONTH FROM fp.payment_date) = $2
               AND EXTRACT(YEAR FROM fp.payment_date) = $3`,
            [schoolId, m, y]
        );

        successResponse(res, 'Monthly collection fetched', {
            month: m,
            year: y,
            ...result.rows[0],
        });
    } catch (error) {
        console.error('Get monthly collection error:', error);
        errorResponse(res, 'Failed to fetch collection', 500);
    }
};

// Generate fees for a class/month
export const generateFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const { classIds, month, year } = req.body;
        const schoolId = (req as any).user.school_id;

        // Build base query to find students
        let studentQuery = `
            SELECT s.id, s.govt_fee_concession_percent, s.current_class_id
            FROM students s
            WHERE s.school_id = $1 AND s.status = 'active'
        `;
        const studentParams: any[] = [schoolId];

        if (classIds && classIds.length > 0) {
            studentQuery += ` AND s.current_class_id = ANY($2)`;
            studentParams.push(classIds);
        }

        const studentsResult = await query(studentQuery, studentParams);

        // We'll need fee structures for each unique class involved
        const involvedClasses = [...new Set(studentsResult.rows.map(s => s.current_class_id))];

        // Map to store structures per class
        const structuresMap = new Map();
        for (const clsId of involvedClasses) {
            const res = await query(
                `SELECT fs.*, ft.is_recurring FROM fee_structures fs
                 JOIN fee_types ft ON fs.fee_type_id = ft.id
                 JOIN academic_years ay ON fs.academic_year_id = ay.id
                 WHERE fs.class_id = $1 AND ay.is_current = true`,
                [clsId]
            );
            structuresMap.set(clsId, res.rows);
        }

        let createdCount = 0;

        for (const student of studentsResult.rows) {
            const structures = structuresMap.get(student.current_class_id) || [];
            for (const structure of structures) {
                // Ignore non-recurring fees if not specifically month 1 (usually April/session start)
                // However, the original logic was simpler. Let's stick to standard monthly for tuition.
                // In this ERP, tuition is usually recurring.

                const originalAmount = parseFloat(structure.amount);
                const govtConcession = originalAmount * (student.govt_fee_concession_percent / 100);
                const amountDue = originalAmount - govtConcession;

                await query(
                    `INSERT INTO student_fees (student_id, fee_structure_id, month, year, original_amount, 
                                     govt_concession_amount, amount_due, amount_pending, due_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, MAKE_DATE($4, $3, $8))
            ON CONFLICT (student_id, fee_structure_id, month, year) DO NOTHING`,
                    [student.id, structure.id, month, year, originalAmount, govtConcession, amountDue, structure.due_day]
                );
                createdCount++;
            }
        }

        successResponse(res, 'Fees generated successfully', { createdCount });
    } catch (error) {
        console.error('Generate fees error:', error);
        errorResponse(res, 'Failed to generate fees', 500);
    }
};

// Update student fee details
export const updateStudentFee = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { amount, dueDate } = req.body;

        const result = await transaction(async (client) => {
            // Get current fee details
            const feeResult = await client.query(
                `SELECT * FROM student_fees WHERE id = $1`,
                [id]
            );

            if (feeResult.rows.length === 0) {
                return null; // Handle 404 outside
            }

            const currentFee = feeResult.rows[0];
            const paidAmount = parseFloat(currentFee.amount_paid);
            const newAmount = parseFloat(amount);

            // Validation: Cannot set amount less than what is already paid
            if (newAmount < paidAmount) {
                throw new Error(`New amount (${newAmount}) cannot be less than paid amount (${paidAmount})`);
            }

            // Calculate new pending amount
            const newPending = newAmount - paidAmount;

            // Determine new status
            let newStatus = currentFee.status;
            if (newPending === 0) {
                newStatus = 'paid';
            } else if (paidAmount > 0) {
                newStatus = 'partial';
            } else {
                newStatus = 'pending'; // or 'overdue' if check date, but let's stick to simple logic for now
                // Ideally, check if overdue based on new due date
                if (dueDate && new Date(dueDate) < new Date()) {
                    newStatus = 'overdue';
                } else if (currentFee.status === 'overdue' && (!dueDate || new Date(dueDate) >= new Date())) {
                    newStatus = 'pending';
                }
            }

            // Update the fee record
            // updating original_amount as well to reflect the manual override as the "new" original for this record
            // OR should we keep original_amount as per structure and only update amount_due?
            // User asked to "change the fee", implying the amount due. 
            // Let's update amount_due. original_amount might be useful for history, but if we change amount_due, 
            // the semantic is "this is what is owed now". 

            await client.query(
                `UPDATE student_fees 
                 SET amount_due = $2, 
                     amount_pending = $3, 
                     due_date = COALESCE($4, due_date),
                     status = $5
                 WHERE id = $1`,
                [id, newAmount, newPending, dueDate, newStatus]
            );

            return { ...currentFee, amount_due: newAmount, amount_pending: newPending, status: newStatus };
        });

        if (!result) {
            errorResponse(res, 'Student fee record not found', 404);
            return;
        }

        successResponse(res, 'Student fee updated successfully', result);

    } catch (error: any) {
        console.error('Update student fee error:', error);
        errorResponse(res, error.message || 'Failed to update student fee', 400);
    }
};

// Apply fee discount
export const applyDiscount = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { studentId, feeTypeId, discountType, discountValue, reason, validFrom, validTo } = req.body;

        await query(
            `INSERT INTO fee_discounts (student_id, fee_type_id, discount_type, discount_value, reason, approved_by, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [studentId, feeTypeId, discountType, discountValue, reason, userId, validFrom, validTo]
        );

        successResponse(res, 'Discount applied successfully', null, 201);
    } catch (error) {
        console.error('Apply discount error:', error);
        errorResponse(res, 'Failed to apply discount', 500);
    }
};
// Get all payments (for list view)
// controllers/fee.controller.js

// Get all payments (for list view)
// Get all payments (for list view)
export const getAllPayments = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId, page = 1, limit = 10 } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build dynamic query
        let whereClause = '';
        const params: any[] = [];
        let paramCounter = 0;

        if (studentId) {
            paramCounter++;
            whereClause = `WHERE sf.student_id = $${paramCounter}`;
            params.push(studentId);
        }

        // Add pagination params
        params.push(limitNum);
        params.push(offset);

        // Get payments with details
        const result = await query(
            `SELECT fp.id, fp.amount_paid, fp.payment_mode, fp.receipt_number, fp.payment_date,
                    up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    c.name as class_name, sec.name as section_name
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             JOIN students s ON sf.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             ${whereClause}
             ORDER BY fp.payment_date DESC
             LIMIT $${paramCounter + 1} OFFSET $${paramCounter + 2}`,
            params
        );

        // Get total count
        const countParams = studentId ? [studentId] : [];
        const countResult = await query(
            `SELECT COUNT(DISTINCT fp.id) as total
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             ${whereClause.replace(`$${paramCounter}`, '$1')}`,
            countParams
        );

        const totalRecords = parseInt(countResult.rows[0].total || '0');
        const totalPages = Math.ceil(totalRecords / limitNum);

        successResponse(res, 'Payments fetched successfully', result.rows, 200, {
            page: pageNum,
            limit: limitNum,
            total: totalRecords,
            totalPages
        });
    } catch (error) {
        console.error('Get all payments error:', error);
        errorResponse(res, 'Failed to fetch payments', 500);
    }
};

// Get all fee structures
export const getFeeStructures = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT fs.*, ft.name as fee_type_name, c.name as class_name
             FROM fee_structures fs
             JOIN fee_types ft ON fs.fee_type_id = ft.id
             JOIN classes c ON fs.class_id = c.id
             JOIN academic_years ay ON fs.academic_year_id = ay.id
             WHERE ft.school_id = $1 AND ay.is_current = true
             ORDER BY c.numeric_value ASC, ft.name ASC`,
            [schoolId]
        );

        successResponse(res, 'Fee structures fetched successfully', result.rows);
    } catch (error) {
        console.error('Get fee structures error:', error);
        errorResponse(res, 'Failed to fetch fee structures', 500);
    }
};

// Record a payment (alias for collectFee but can be independently extended)
export const recordPayment = async (req: Request, res: Response): Promise<void> => {
    // Re-use collectFee logic
    return collectFee(req, res);
};

// Bulk update fee structures
export const updateFeeStructures = async (req: Request, res: Response): Promise<void> => {
    try {
        const { structures } = req.body; // Array of {id, amount}

        if (!Array.isArray(structures)) {
            errorResponse(res, 'Invalid structures data', 400);
            return;
        }

        await transaction(async (client) => {
            for (const struct of structures) {
                if (!struct.id) continue;

                // Update the structure
                await client.query(
                    `UPDATE fee_structures SET amount = $1 WHERE id = $2`,
                    [struct.amount, struct.id]
                );
            }
        });

        successResponse(res, 'Fee structures updated successfully');
    } catch (error) {
        console.error('Update fee structures error:', error);
        errorResponse(res, 'Failed to update fee structures', 500);
    }
};

// Create a new fee type
export const createFeeType = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { name, description, isRecurring } = req.body;

        const result = await query(
            'INSERT INTO fee_types (school_id, name, description, is_recurring) VALUES ($1, $2, $3, $4) RETURNING *',
            [schoolId, name, description, isRecurring]
        );

        successResponse(res, 'Fee type created successfully', result.rows[0]);
    } catch (error) {
        console.error('Create fee type error:', error);
        errorResponse(res, 'Failed to create fee type', 500);
    }
};

// Get fee metadata (classes and fee types)
export const getFeeMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const classes = await query(
            'SELECT id, name FROM classes WHERE school_id = $1 ORDER BY numeric_value ASC',
            [schoolId]
        );

        const feeTypes = await query(
            'SELECT id, name, is_recurring FROM fee_types WHERE school_id = $1 ORDER BY name ASC',
            [schoolId]
        );

        successResponse(res, 'Fee metadata fetched successfully', {
            classes: classes.rows,
            feeTypes: feeTypes.rows
        });
    } catch (error) {
        console.error('Get fee metadata error:', error);
        errorResponse(res, 'Failed to fetch fee metadata', 500);
    }
};

// Delete a fee type
export const deleteFeeType = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const schoolId = req.user?.schoolId;

        // Check if there are any payments associated with this fee type
        const paymentCheck = await query(
            `SELECT COUNT(*) as count 
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             JOIN fee_structures fs ON sf.fee_structure_id = fs.id
             WHERE fs.fee_type_id = $1`,
            [id]
        );

        if (parseInt(paymentCheck.rows[0].count) > 0) {
            errorResponse(res, 'Cannot delete fee type because it has associated payments. Delete payments first or contact support.', 400);
            return;
        }

        await transaction(async (client) => {
            // Delete associated fee structures (and their student_fees if no payments)
            // The constraint should handle this, but let's be explicit if needed
            // Actually, we'll just delete the fee type and let foreign keys work if ON DELETE CASCADE is set
            // If not, we do it manually.
            await client.query('DELETE FROM student_fees WHERE fee_structure_id IN (SELECT id FROM fee_structures WHERE fee_type_id = $1)', [id]);
            await client.query('DELETE FROM fee_structures WHERE fee_type_id = $1', [id]);
            await client.query('DELETE FROM fee_types WHERE id = $1 AND school_id = $2', [id, schoolId]);
        });

        successResponse(res, 'Fee type and associated structures deleted successfully');
    } catch (error) {
        console.error('Delete fee type error:', error);
        errorResponse(res, 'Failed to delete fee type', 500);
    }
};

// Get detailed collections (today or yearly)
export const getCollectionsDetail = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { type } = req.query; // 'today' or 'yearly'
        const today = new Date().toISOString().split('T')[0];

        let dateClause = '';
        if (type === 'today') {
            dateClause = `AND fp.payment_date = '${today}'`;
        }

        const result = await query(
            `SELECT s.id as student_id, s.admission_number,
                    up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    c.name as class_name, sec.name as section_name,
                    u.phone,
                    SUM(fp.amount_paid) as amount_paid,
                    MAX(fp.payment_date) as last_payment_date,
                    (SELECT sf2.status FROM student_fees sf2 
                     WHERE sf2.student_id = s.id 
                     ORDER BY sf2.year DESC, sf2.month DESC LIMIT 1) as current_status
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             JOIN students s ON sf.student_id = s.id
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             WHERE u.school_id = $1 ${dateClause}
             GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name, u.phone
             ORDER BY last_payment_date DESC`,
            [schoolId]
        );

        successResponse(res, 'Collections detail fetched', result.rows);
    } catch (error) {
        console.error('Get collections detail error:', error);
        errorResponse(res, 'Failed to fetch collections detail', 500);
    }
};

// Get detailed pending fees
export const getPendingFeesDetail = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await query(
            `SELECT s.id as student_id, s.admission_number,
                    up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
                    c.name as class_name, sec.name as section_name,
                    u.phone,
                    CASE 
                      WHEN COUNT(sf.id) > 0 THEN SUM(sf.amount_pending)
                      ELSE c.monthly_fee_amount
                    END as total_pending,
                    MIN(sf.due_date) as oldest_due_date
             FROM students s
             JOIN users u ON s.user_id = u.id
             JOIN user_profiles up ON u.id = up.user_id
             JOIN classes c ON s.current_class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN student_fees sf ON s.id = sf.student_id
             WHERE u.school_id = $1 AND s.status = 'active'
             GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name, u.phone, c.monthly_fee_amount
             HAVING (COUNT(sf.id) > 0 AND SUM(sf.amount_pending) > 0) OR COUNT(sf.id) = 0
             ORDER BY total_pending DESC`,
            [schoolId]
        );

        successResponse(res, 'Pending fees detail fetched', result.rows);
    } catch (error) {
        console.error('Get pending fees detail error:', error);
        errorResponse(res, 'Failed to fetch pending fees detail', 500);
    }
};

// Initialize fee structures for all classes/types
export const initializeFeeStructures = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;

        const result = await transaction(async (client) => {
            // Get current academic year
            const ayResult = await client.query(
                'SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true',
                [schoolId]
            );

            if (ayResult.rows.length === 0) {
                throw new Error('No current academic year found');
            }

            const ayId = ayResult.rows[0].id;

            // Get all classes and fee types
            const classes = await client.query('SELECT id FROM classes WHERE school_id = $1', [schoolId]);
            const feeTypes = await client.query('SELECT id FROM fee_types WHERE school_id = $1', [schoolId]);

            let createdCount = 0;
            for (const cls of classes.rows) {
                for (const ft of feeTypes.rows) {
                    const insertResult = await client.query(
                        `INSERT INTO fee_structures (class_id, fee_type_id, academic_year_id, amount) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (class_id, fee_type_id, academic_year_id) DO NOTHING`,
                        [cls.id, ft.id, ayId, 0]
                    );
                    if (insertResult.rowCount && insertResult.rowCount > 0) createdCount++;
                }
            }
            return createdCount;
        });

        successResponse(res, `${result} new fee structure records initialized`);
    } catch (error: any) {
        console.error('Initialize fee structures error:', error);
        errorResponse(res, error.message || 'Failed to initialize fee structures', 500);
    }
};


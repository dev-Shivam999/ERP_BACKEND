import { query } from '../config/database';

/**
 * Global Fee Calculator Utility
 * Provides consistent fee calculations across all controllers
 */

// SQL fragments for fee calculations - use these in all queries for consistency
export const FEE_CALC_SQL = {
    // Get total fee structure amount for a class
    CLASS_TOTAL_DUE: `COALESCE((SELECT SUM(fs.amount) FROM fee_structures fs WHERE fs.class_id = {{class_id}}), 0)`,

    // Get total paid by student
    STUDENT_TOTAL_PAID: `COALESCE((SELECT SUM(sf.amount_paid) FROM student_fees sf WHERE sf.student_id = {{student_id}}), 0)`,

    // Get pending = due - paid
    STUDENT_PENDING: `GREATEST(
        COALESCE((SELECT SUM(fs.amount) FROM fee_structures fs WHERE fs.class_id = {{class_id}}), 0)
        - COALESCE((SELECT SUM(sf.amount_paid) FROM student_fees sf WHERE sf.student_id = {{student_id}}), 0),
        0
    )`,
};

/**
 * Get fee totals for a single student
 */
export async function getStudentFeeTotals(studentId: string | number): Promise<{
    totalDue: number;
    totalPaid: number;
    totalPending: number;
    className: string;
    classId: string | number;
    breakdown: Array<{
        name: string;
        target: number;
        paid: number;
        pending: number;
        frequency?: string;
        monthlyAmount?: number;
        originalName?: string;
    }>;
}> {
    // 1. Get student info and basic totals
    const studentResult = await query(
        `SELECT s.id, s.current_class_id, c.name as class_name, s.govt_fee_concession_percent
         FROM students s
         JOIN classes c ON s.current_class_id = c.id
         WHERE s.id = $1`,
        [studentId]
    );

    if (studentResult.rows.length === 0) {
        return { totalDue: 0, totalPaid: 0, totalPending: 0, className: '', classId: 0, breakdown: [] };
    }

    const student = studentResult.rows[0];
    const concessionPercent = parseFloat(student.govt_fee_concession_percent || '0');

    // 2. Get breakdown of structures and payments
    // We join structures with payments for this student
    const breakdownResult = await query(
        `SELECT 
            ft.name as fee_type_name,
            fs.amount as structure_amount,
            fs.frequency,
            COALESCE((
                SELECT SUM(sf.amount_paid) 
                FROM student_fees sf 
                WHERE sf.student_id = $1 AND sf.fee_structure_id = fs.id
            ), 0) as paid_amount
         FROM fee_structures fs
         JOIN fee_types ft ON fs.fee_type_id = ft.id
         JOIN academic_years ay ON fs.academic_year_id = ay.id
         WHERE fs.class_id = $2 AND ay.is_current = true`,
        [studentId, student.current_class_id]
    );

    let totalDue = 0;
    let totalPaid = 0;
    const breakdown = breakdownResult.rows.map(row => {
        const originalMonthlyAmount = parseFloat(row.structure_amount || '0');

        // Multiplier based on frequency
        let multiplier = 1;
        if (row.frequency === 'monthly') multiplier = 12;
        else if (row.frequency === 'quarterly') multiplier = 4;
        else if (row.frequency === 'half_yearly') multiplier = 2;
        else if (row.frequency === 'yearly' || row.frequency === 'one-time') multiplier = 1;

        const originalAnnualAmount = originalMonthlyAmount * multiplier;
        const concession = originalAnnualAmount * (concessionPercent / 100);
        const target = Math.max(0, originalAnnualAmount - concession);
        const paid = parseFloat(row.paid_amount || '0');
        const pending = Math.max(0, target - paid);

        totalDue += target;
        totalPaid += paid;

        // Only add (Annual) if it's a recurring fee that gets multiplied
        const nameSuffix = multiplier > 1 ? ' (Annual)' : '';

        return {
            name: `${row.fee_type_name}${nameSuffix}`,
            target,
            paid,
            pending,
            frequency: row.frequency,
            monthlyAmount: originalMonthlyAmount,
            originalName: row.fee_type_name
        };
    });

    // Handle fallback if no structures found (use class monthly fee as tuition)
    if (breakdown.length === 0) {
        const classResult = await query(`SELECT monthly_fee_amount FROM classes WHERE id = $1`, [student.current_class_id]);
        const monthlyAmount = parseFloat(classResult.rows[0]?.monthly_fee_amount || '0');
        const concession = monthlyAmount * (concessionPercent / 100);
        const target = Math.max(0, monthlyAmount - concession);
        const paid = totalPaid; // already summed from sf if any
        const pending = Math.max(0, target - paid);

        totalDue = target;

        breakdown.push({
            name: 'Tuition Fee (Approx)',
            target,
            paid,
            pending,
            frequency: 'monthly',
            monthlyAmount: target / 12,
            originalName: 'tuition'
        });
    }

    // Redistribute overpayments across the breakdown to ensure per-type pending 
    // matches the overall student balance
    let totalExcess = 0;
    breakdown.forEach(b => {
        if (b.paid > b.target) {
            totalExcess += (b.paid - b.target);
            // In the breakdown view, we cap paid at target if there's excess, 
            // then redistribution spreads it
            b.paid = b.target;
            b.pending = 0;
        }
    });

    if (totalExcess > 0) {
        // Spread excess to items with actual pending > 0
        for (const b of breakdown) {
            if (totalExcess <= 0) break;
            if (b.pending > 0) {
                const canTake = Math.min(totalExcess, b.pending);
                b.paid += canTake;
                b.pending -= canTake;
                totalExcess -= canTake;
            }
        }
    }

    return {
        totalDue,
        totalPaid,
        totalPending: Math.max(0, totalDue - totalPaid),
        className: student.class_name,
        classId: student.current_class_id,
        breakdown
    };
}

/**
 * Get fee totals for all students in a school
 */
export async function getAllStudentsFeeTotals(schoolId: string | number): Promise<Array<{
    studentId: string | number;
    admissionNumber: string;
    studentName: string;
    classId: string | number;
    className: string;
    sectionName: string;
    totalDue: number;
    totalPaid: number;
    totalPending: number;
}>> {
    const result = await query(
        `SELECT 
            s.id as student_id,
            s.admission_number,
            up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
            c.id as class_id,
            c.name as class_name,
            sec.name as section_name,
            COALESCE(
                (SELECT SUM(fs.amount) FROM fee_structures fs WHERE fs.class_id = c.id),
                c.monthly_fee_amount,
                0
            ) as total_due,
            COALESCE((SELECT SUM(sf.amount_paid) FROM student_fees sf WHERE sf.student_id = s.id), 0) as total_paid,
            GREATEST(
                COALESCE(
                    (SELECT SUM(fs.amount) FROM fee_structures fs WHERE fs.class_id = c.id),
                    c.monthly_fee_amount,
                    0
                )
                - COALESCE((SELECT SUM(sf.amount_paid) FROM student_fees sf WHERE sf.student_id = s.id), 0),
                0
            ) as total_pending
         FROM students s
         JOIN users u ON s.user_id = u.id
         JOIN user_profiles up ON u.id = up.user_id
         JOIN classes c ON s.current_class_id = c.id
         JOIN sections sec ON s.section_id = sec.id
         WHERE u.school_id = $1 AND s.status = 'active'
         ORDER BY total_pending DESC, student_name ASC`,
        [schoolId]
    );

    return result.rows.map(row => ({
        studentId: row.student_id,
        admissionNumber: row.admission_number,
        studentName: row.student_name,
        classId: row.class_id,
        className: row.class_name,
        sectionName: row.section_name,
        totalDue: parseFloat(row.total_due || '0'),
        totalPaid: parseFloat(row.total_paid || '0'),
        totalPending: parseFloat(row.total_pending || '0'),
    }));
}

/**
 * Get school-wide fee summary
 */
export async function getSchoolFeeSummary(schoolId: string | number): Promise<{
    todayCollection: number;
    yearlyCollection: number;
    totalPending: number;
    totalStudents: number;
}> {
    const today = new Date().toISOString().split('T')[0];

    // 1. Get collections (Today and Yearly)
    // Use CURRENT_DATE from DB to ensure local timezone of server is respected if configured, 
    // or at least consistent day.
    const collectionsQuery = `
        SELECT 
            COALESCE(SUM(CASE WHEN payment_date = CURRENT_DATE THEN fp.amount_paid ELSE 0 END), 0) as today_collection,
            COALESCE(SUM(fp.amount_paid), 0) as yearly_collection
        FROM fee_payments fp
        JOIN student_fees sf ON fp.student_fee_id = sf.id
        JOIN students s ON sf.student_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE u.school_id = $1
    `;

    // 2. Total Students (Simple, robust query)
    const studentsQuery = `
        SELECT COUNT(*) as total_students
        FROM students s
        JOIN users u ON s.user_id = u.id
        WHERE u.school_id = $1 AND s.status = 'active'
    `;

    // 3. Financials (Expected vs Paid)
    const feesQuery = `
        WITH class_structures AS (
            SELECT class_id, COALESCE(SUM(amount), 0) as class_total
            FROM fee_structures fs
            JOIN academic_years ay ON fs.academic_year_id = ay.id
            WHERE ay.is_current = true
            GROUP BY class_id
        ),
        class_counts AS (
            SELECT current_class_id as class_id, COUNT(*) as student_count
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE u.school_id = $1 AND s.status = 'active'
            GROUP BY current_class_id
        ),
        total_paid AS (
            SELECT COALESCE(SUM(amount_paid), 0) as paid
            FROM student_fees sf
            JOIN students s ON sf.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE u.school_id = $1 AND s.status = 'active'
        )
        SELECT 
            (SELECT COALESCE(SUM(cs.class_total * cc.student_count), 0) 
             FROM class_structures cs 
             JOIN class_counts cc ON cs.class_id = cc.class_id) as total_expected,
            (SELECT paid FROM total_paid) as total_paid
    `;

    const [collectionsResult, studentsResult, feesResult] = await Promise.all([
        query(collectionsQuery, [schoolId]),
        query(studentsQuery, [schoolId]),
        query(feesQuery, [schoolId])
    ]);

    const collections = collectionsResult.rows[0];
    const studentsCount = studentsResult.rows[0];
    const fees = feesResult.rows[0];

    const totalStudents = parseInt(studentsCount.total_students || '0');
    const totalExpected = parseFloat(fees.total_expected || '0');
    const totalPaid = parseFloat(fees.total_paid || '0');
    const totalPending = Math.max(0, totalExpected - totalPaid);

    console.log('Dashboard Debug:', {
        schoolId,
        totalStudents,
        totalExpected,
        totalPaid,
        todayCollection: collections.today_collection
    });

    return {
        todayCollection: parseFloat(collections.today_collection || '0'),
        yearlyCollection: parseFloat(collections.yearly_collection || '0'),
        totalPending: totalPending,
        totalStudents: totalStudents,
    };
}

/**
 * Get class fee structure total
 */
export async function getClassFeeStructureTotal(classId: string | number): Promise<number> {
    const result = await query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM fee_structures WHERE class_id = $1`,
        [classId]
    );
    return parseFloat(result.rows[0]?.total || '0');
}

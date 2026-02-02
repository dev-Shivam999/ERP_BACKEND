/**
 * Stored Procedures in TypeScript
 * Procedures auto-update when content changes
 */

// ============================================
// GENERATE STUDENT ID
// ============================================
export const spGenerateStudentId = () => `
CREATE OR REPLACE FUNCTION sp_generate_student_id(p_school_id UUID, p_year INTEGER DEFAULT NULL)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
  v_student_id VARCHAR(20);
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(admission_number FROM 8) AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM students s
  JOIN users u ON s.user_id = u.id
  WHERE u.school_id = p_school_id
    AND admission_number LIKE 'STD' || v_year || '%';
  
  v_student_id := 'STD' || v_year || LPAD(v_sequence::TEXT, 3, '0');
  RETURN v_student_id;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// GENERATE EMPLOYEE ID
// ============================================
export const spGenerateEmployeeId = () => `
CREATE OR REPLACE FUNCTION sp_generate_employee_id(p_school_id UUID, p_year INTEGER DEFAULT NULL)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
  v_employee_id VARCHAR(20);
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(employee_id FROM 10 FOR 3) AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM teachers t
  JOIN users u ON t.user_id = u.id
  WHERE u.school_id = p_school_id
    AND employee_id LIKE 'EMP/' || v_year || '/%';
  
  v_employee_id := 'EMP/' || v_year || '/' || LPAD(v_sequence::TEXT, 3, '0');
  RETURN v_employee_id;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// GENERATE RECEIPT NUMBER
// ============================================

export const spGenerateReceiptNumber = () => `
CREATE OR REPLACE FUNCTION sp_generate_receipt_number(p_school_id UUID, p_year INTEGER DEFAULT NULL)
RETURNS VARCHAR(30) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
  v_receipt_number VARCHAR(30);
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 10) AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM fee_payments fp
  JOIN student_fees sf ON fp.student_fee_id = sf.id
  JOIN students s ON sf.student_id = s.id
  JOIN users u ON s.user_id = u.id
  WHERE u.school_id = p_school_id
    AND receipt_number LIKE 'FEE/' || v_year || '/%';
  
  v_receipt_number := 'FEE/' || v_year || '/' || LPAD(v_sequence::TEXT, 5, '0');
  RETURN v_receipt_number;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// MARK CLASS ATTENDANCE
// ============================================
export const spMarkClassAttendance = () => `
CREATE OR REPLACE FUNCTION sp_mark_class_attendance(
  p_class_id UUID,
  p_section_id UUID,
  p_date DATE,
  p_attendance JSONB,
  p_marked_by UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, absent_count INTEGER) AS $$
DECLARE
  v_student RECORD;
  v_status attendance_status;
  v_status_text TEXT;
  v_absent_count INTEGER := 0;
BEGIN
  FOR v_student IN 
    SELECT s.id as student_id, u.id as user_id
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.current_class_id = p_class_id 
      AND s.section_id = p_section_id 
      AND s.status = 'active'
  LOOP
    v_status_text := p_attendance->>(v_student.student_id::TEXT);
    
    IF v_status_text IS NOT NULL THEN
        v_status := v_status_text::attendance_status;
        
        INSERT INTO student_attendance (student_id, class_id, section_id, date, status, marked_by)
        VALUES (v_student.student_id, p_class_id, p_section_id, p_date, v_status, p_marked_by)
        ON CONFLICT (student_id, date) 
        DO UPDATE SET status = v_status, marked_by = p_marked_by, marked_at = CURRENT_TIMESTAMP;
        
        IF v_status = 'absent' THEN
          v_absent_count := v_absent_count + 1;
          -- Create notification for absent student's parent
          INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, target_ids, created_by)
          SELECT u.school_id, 'Attendance Alert', 
                 'Your child was marked absent on ' || p_date::TEXT,
                 'attendance', 'high', 'individual', 
                 jsonb_build_array(v_student.user_id), p_marked_by
          FROM users u WHERE u.id = v_student.user_id;
        END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT true, 'Attendance marked successfully'::TEXT, v_absent_count;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// CALCULATE MONTHLY SALARY
// ============================================
export const spCalculateMonthlySalary = () => `
CREATE OR REPLACE FUNCTION sp_calculate_monthly_salary(
  p_teacher_id UUID,
  p_month INTEGER,
  p_year INTEGER,
  p_working_days INTEGER,
  p_generated_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_salary_structure RECORD;
  v_present_days INTEGER;
  v_leave_days INTEGER;
  v_basic DECIMAL(10,2);
  v_hra DECIMAL(10,2);
  v_da DECIMAL(10,2);
  v_gross DECIMAL(10,2);
  v_pf DECIMAL(10,2);
  v_total_deductions DECIMAL(10,2);
  v_net DECIMAL(10,2);
  v_slip_id UUID;
BEGIN
  -- Get salary structure
  SELECT * INTO v_salary_structure
  FROM salary_structures
  WHERE teacher_id = p_teacher_id
    AND effective_from <= make_date(p_year, p_month, 1)
  ORDER BY effective_from DESC LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No salary structure found for teacher';
  END IF;
  
  -- Count approved leaves
  SELECT COUNT(*)::INTEGER INTO v_leave_days
  FROM leave_applications la
  JOIN teachers t ON la.applicant_id = t.user_id
  WHERE t.id = p_teacher_id
    AND la.status = 'approved'
    AND EXTRACT(MONTH FROM la.from_date) = p_month
    AND EXTRACT(YEAR FROM la.from_date) = p_year;
  
  v_present_days := p_working_days - v_leave_days;
  
  -- Calculate salary components
  v_basic := (v_salary_structure.basic_salary / p_working_days) * v_present_days;
  v_hra := v_basic * (v_salary_structure.hra_percentage / 100);
  v_da := v_basic * (v_salary_structure.da_percentage / 100);
  v_gross := v_basic + v_hra + v_da + v_salary_structure.transport_allowance + v_salary_structure.special_allowance;
  v_pf := v_basic * (v_salary_structure.pf_percentage / 100);
  v_total_deductions := v_pf + v_salary_structure.professional_tax;
  v_net := v_gross - v_total_deductions;
  
  -- Insert salary slip
  INSERT INTO salary_slips (
    teacher_id, month, year, working_days, present_days, leave_days,
    basic_salary, hra, da, transport_allowance, special_allowance,
    gross_salary, pf_deduction, professional_tax, total_deductions, net_salary,
    generated_by
  ) VALUES (
    p_teacher_id, p_month, p_year, p_working_days, v_present_days, v_leave_days,
    v_basic, v_hra, v_da, v_salary_structure.transport_allowance, v_salary_structure.special_allowance,
    v_gross, v_pf, v_salary_structure.professional_tax, v_total_deductions, v_net,
    p_generated_by
  )
  ON CONFLICT (teacher_id, month, year) DO UPDATE SET
    working_days = EXCLUDED.working_days,
    present_days = EXCLUDED.present_days,
    net_salary = EXCLUDED.net_salary
  RETURNING id INTO v_slip_id;
  
  RETURN v_slip_id;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// PROMOTE STUDENTS
// ============================================
export const spPromoteStudents = () => `
CREATE OR REPLACE FUNCTION sp_promote_students(
  p_from_class_id UUID,
  p_to_class_id UUID,
  p_to_section_id UUID,
  p_academic_year VARCHAR(20),
  p_promoted_by UUID,
  p_student_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(promoted_count INTEGER, message TEXT) AS $$
DECLARE
  v_student RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_student IN 
    SELECT id, section_id
    FROM students
    WHERE current_class_id = p_from_class_id
      AND status = 'active'
      AND (p_student_ids IS NULL OR id = ANY(p_student_ids))
  LOOP
    -- Create promotion record
    INSERT INTO student_promotions (student_id, from_class_id, to_class_id, from_section_id, to_section_id, academic_year, promoted_by)
    VALUES (v_student.id, p_from_class_id, p_to_class_id, v_student.section_id, p_to_section_id, p_academic_year, p_promoted_by);
    
    -- Update student's current class
    UPDATE students 
    SET current_class_id = p_to_class_id, 
        section_id = p_to_section_id, 
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_student.id;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_count, ('Successfully promoted ' || v_count || ' students')::TEXT;
END;
$$ LANGUAGE plpgsql;
`;

// ============================================
// ALL PROCEDURES EXPORT
// ============================================
export const allProcedures = [
  { name: 'sp_generate_student_id', sql: spGenerateStudentId },
  { name: 'sp_generate_employee_id', sql: spGenerateEmployeeId },
  { name: 'sp_generate_receipt_number', sql: spGenerateReceiptNumber },
  { name: 'sp_mark_class_attendance', sql: spMarkClassAttendance },
  { name: 'sp_calculate_monthly_salary', sql: spCalculateMonthlySalary },
  { name: 'sp_promote_students', sql: spPromoteStudents },
];

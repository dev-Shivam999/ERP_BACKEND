/**
 * Table Definitions in TypeScript
 * Each table is defined as a function that returns the SQL
 */

// Helper to create table SQL
export const createTable = (name: string, columns: string): string => `
CREATE TABLE IF NOT EXISTS ${name} (
  ${columns}
);
`;

// ============================================
// 1. SCHOOLS TABLE
// ============================================
export const schools = () => `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  logo_url TEXT,
  board VARCHAR(50),
  academic_year_start_month INTEGER DEFAULT 4,
  academic_year_end_month INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// ============================================
// 2. USERS TABLE
// ============================================
export const users = () => `
CREATE TYPE user_role AS ENUM ('admin', 'management', 'teacher', 'fee_collector', 'student', 'parent');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE blood_group_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role NOT NULL,
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  gender gender_type,
  date_of_birth DATE,
  blood_group blood_group_type,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  photo_url TEXT,
  aadhar_number VARCHAR(12),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_users_role ON users(role);
`;

// ============================================
// 3. ACADEMIC STRUCTURE
// ============================================
export const academicStructure = () => `
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  numeric_value INTEGER,
  display_order INTEGER NOT NULL,
  monthly_fee_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name VARCHAR(10) NOT NULL,
  capacity INTEGER DEFAULT 40,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, name)
);

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_break BOOLEAN DEFAULT false,
  break_name VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, period_number)
);
`;

// ============================================
// 4. STUDENTS
// ============================================
export const students = () => `
CREATE TYPE religion_type AS ENUM ('hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'jain', 'other');
CREATE TYPE category_type AS ENUM ('general', 'obc', 'sc', 'st', 'ews');
CREATE TYPE student_status AS ENUM ('active', 'inactive', 'left', 'passed_out');
CREATE TYPE document_type AS ENUM ('birth_certificate', 'aadhar', 'transfer_certificate', 'mark_sheet', 
                                   'caste_certificate', 'income_certificate', 'domicile', 'photo', 'other');
CREATE TYPE parent_relation AS ENUM ('father', 'mother', 'guardian');

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admission_number VARCHAR(20) NOT NULL UNIQUE,
  admission_date DATE DEFAULT CURRENT_DATE,
  admission_class_id UUID NOT NULL REFERENCES classes(id),
  current_class_id UUID NOT NULL REFERENCES classes(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  roll_number INTEGER,
  stream VARCHAR(50),
  religion religion_type,
  nationality VARCHAR(50) DEFAULT 'Indian',
  mother_tongue VARCHAR(50),
  caste VARCHAR(100),
  category category_type DEFAULT 'general',
  is_minority BOOLEAN DEFAULT false,
  sub_category VARCHAR(100),
  is_bpl BOOLEAN DEFAULT false,
  is_govt_scholarship BOOLEAN DEFAULT false,
  scholarship_type VARCHAR(100),
  scholarship_amount DECIMAL(10, 2) DEFAULT 0,
  govt_fee_concession_percent DECIMAL(5, 2) DEFAULT 0,
  previous_school VARCHAR(255),
  previous_school_board VARCHAR(100),
  transfer_certificate_no VARCHAR(100),
  transport_required BOOLEAN DEFAULT false,
  hostel_required BOOLEAN DEFAULT false,
  status student_status DEFAULT 'active',
  leaving_date DATE,
  leaving_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  occupation VARCHAR(100),
  annual_income DECIMAL(12, 2),
  office_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relationship parent_relation NOT NULL,
  is_primary_contact BOOLEAN DEFAULT false,
  UNIQUE(student_id, parent_id)
);

CREATE INDEX idx_students_admission_number ON students(admission_number);
CREATE INDEX idx_students_class_section ON students(current_class_id, section_id);
CREATE INDEX idx_students_category ON students(category);
`;

// ============================================
// 5. ATTENDANCE
// ============================================
export const attendance = () => `
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'half_day', 'holiday');

CREATE TABLE IF NOT EXISTS student_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  date DATE NOT NULL,
  status attendance_status NOT NULL,
  late_time TIME,
  marked_by UUID NOT NULL REFERENCES users(id),
  marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  remarks TEXT,
  UNIQUE(student_id, date)
);

CREATE INDEX idx_attendance_date ON student_attendance(date);
CREATE INDEX idx_attendance_class_section ON student_attendance(class_id, section_id, date);
`;

// ============================================
// 6. FEES
// ============================================
export const fees = () => `
CREATE TYPE fee_frequency AS ENUM ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time');
CREATE TYPE fee_status AS ENUM ('pending', 'partial', 'paid', 'overdue', 'waived');
CREATE TYPE payment_mode AS ENUM ('cash', 'online', 'cheque', 'upi', 'card');
CREATE TYPE discount_reason AS ENUM ('sibling', 'merit', 'sports', 'staff_child', 'govt_scheme', 'financial_hardship', 'other');

CREATE TABLE IF NOT EXISTS fee_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT true,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, name)
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  fee_type_id UUID NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  amount DECIMAL(10, 2) NOT NULL,
  frequency fee_frequency NOT NULL DEFAULT 'monthly',
  due_day INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, fee_type_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS student_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  original_amount DECIMAL(10, 2) NOT NULL,
  govt_concession_amount DECIMAL(10, 2) DEFAULT 0,
  scholarship_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  amount_due DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  amount_pending DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  status fee_status DEFAULT 'pending',
  late_fee DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, fee_structure_id, month, year)
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_fee_id UUID NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
  receipt_number VARCHAR(30) NOT NULL UNIQUE,
  amount_paid DECIMAL(10, 2) NOT NULL,
  payment_mode payment_mode NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cheque_number VARCHAR(20),
  cheque_date DATE,
  bank_name VARCHAR(100),
  transaction_id VARCHAR(100),
  collected_by UUID NOT NULL REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_student_fees_student ON student_fees(student_id);
CREATE INDEX idx_student_fees_status ON student_fees(status);
CREATE INDEX idx_fee_payments_receipt ON fee_payments(receipt_number);
`;

// ============================================
// 7. TEACHERS
// ============================================
export const teachers = () => `
CREATE TYPE teacher_designation AS ENUM ('principal', 'vice_principal', 'head_teacher', 'senior_teacher', 'teacher', 'assistant_teacher');
CREATE TYPE teacher_status AS ENUM ('active', 'inactive', 'on_leave', 'resigned');

CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id VARCHAR(20) NOT NULL UNIQUE,
  designation teacher_designation NOT NULL,
  qualification VARCHAR(255),
  experience_years INTEGER DEFAULT 0,
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status teacher_status DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_class_teacher BOOLEAN DEFAULT false,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, section_id, subject_id, academic_year_id)
);

CREATE UNIQUE INDEX idx_unique_class_teacher 
ON teacher_class_assignments (class_id, section_id, academic_year_id) 
WHERE is_class_teacher = true;
`;

// ============================================
// 8. EXAMS & RESULTS
// ============================================
export const exams = () => `
CREATE TYPE exam_type AS ENUM ('unit_test', 'mid_term', 'final', 'class_test');

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  name VARCHAR(100) NOT NULL,
  exam_type exam_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_marks INTEGER NOT NULL DEFAULT 100,
  passing_marks INTEGER NOT NULL DEFAULT 33,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id, class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS exam_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained DECIMAL(5, 2),
  is_absent BOOLEAN DEFAULT false,
  entered_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_schedule_id, student_id)
);

CREATE TABLE IF NOT EXISTS grade_scales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  min_percentage DECIMAL(5, 2) NOT NULL,
  max_percentage DECIMAL(5, 2) NOT NULL,
  grade VARCHAR(5) NOT NULL,
  grade_point DECIMAL(3, 1),
  remarks VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  total_marks INTEGER NOT NULL,
  obtained_marks DECIMAL(7, 2) NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  grade VARCHAR(5),
  rank_in_class INTEGER,
  is_published BOOLEAN DEFAULT false,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, exam_id)
);
`;

// ============================================
// 9. NOTIFICATIONS
// ============================================
// ============================================
// 9. NOTIFICATIONS
// ============================================
export const notifications = () => `
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM ('attendance', 'fee_reminder', 'fee_receipt', 'result', 'holiday', 'event', 'homework', 'general');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
        CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_target') THEN
        CREATE TYPE notification_target AS ENUM ('all', 'class', 'section', 'individual', 'role');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type notification_type NOT NULL,
  priority notification_priority DEFAULT 'normal',
  target_type notification_target NOT NULL,
  target_ids JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  scheduled_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id, user_id)
);
`;

// ============================================
// 10. RESULTS & MARKS MANAGEMENT
// ============================================
export const resultsManagement = () => `
CREATE TYPE result_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE grade_type AS ENUM ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F');

CREATE TABLE IF NOT EXISTS result_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status result_status DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, exam_id)
);

CREATE TABLE IF NOT EXISTS student_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_session_id UUID NOT NULL REFERENCES result_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  total_marks DECIMAL(6, 2) DEFAULT 0,
  obtained_marks DECIMAL(6, 2) DEFAULT 0,
  percentage DECIMAL(5, 2) DEFAULT 0,
  grade grade_type,
  rank INTEGER,
  status result_status DEFAULT 'draft',
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(result_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS subject_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_result_id UUID NOT NULL REFERENCES student_results(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  max_marks DECIMAL(6, 2) NOT NULL,
  obtained_marks DECIMAL(6, 2) NOT NULL DEFAULT 0,
  grade grade_type,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_result_id, subject_id)
);

CREATE TABLE IF NOT EXISTS result_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_session_id UUID NOT NULL REFERENCES result_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(result_session_id, student_id)
);

-- Indexes for performance
CREATE INDEX idx_student_results_session ON student_results(result_session_id);
CREATE INDEX idx_student_results_student ON student_results(student_id);
CREATE INDEX idx_subject_marks_result ON subject_marks(student_result_id);
CREATE INDEX idx_result_notifications_session ON result_notifications(result_session_id);
`;

// ============================================
// 11. GRADE CALCULATION FUNCTIONS
// ============================================
// ============================================
// 11. GRADE CALCULATION FUNCTIONS
// ============================================
export const gradeCalculationFunctions = () => `
-- Function to calculate grade based on percentage
CREATE OR REPLACE FUNCTION calculate_grade(percentage DECIMAL)
RETURNS grade_type AS $$
BEGIN
  CASE 
    WHEN percentage >= 90 THEN RETURN 'A+';
    WHEN percentage >= 80 THEN RETURN 'A';
    WHEN percentage >= 70 THEN RETURN 'B+';
    WHEN percentage >= 60 THEN RETURN 'B';
    WHEN percentage >= 50 THEN RETURN 'C+';
    WHEN percentage >= 40 THEN RETURN 'C';
    WHEN percentage >= 33 THEN RETURN 'D';
    ELSE RETURN 'F';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to update student result totals
CREATE OR REPLACE FUNCTION update_student_result_totals(student_result_uuid UUID)
RETURNS VOID AS $$
DECLARE
  total_max DECIMAL(8, 2);
  total_obtained DECIMAL(8, 2);
  calc_percentage DECIMAL(5, 2);
  calc_grade grade_type;
BEGIN
  -- Calculate totals from subject marks
  SELECT 
    COALESCE(SUM(max_marks), 0),
    COALESCE(SUM(obtained_marks), 0)
  INTO total_max, total_obtained
  FROM subject_marks 
  WHERE student_result_id = student_result_uuid;
  
  -- Calculate percentage
  IF total_max > 0 THEN
    calc_percentage := ROUND((total_obtained / total_max) * 100, 2);
  ELSE
    calc_percentage := 0;
  END IF;
  
  -- Calculate grade
  calc_grade := calculate_grade(calc_percentage);
  
  -- Update student result
  UPDATE student_results 
  SET 
    total_marks = total_max,
    obtained_marks = total_obtained,
    percentage = calc_percentage,
    grade = calc_grade,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = student_result_uuid;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update totals when subject marks change
CREATE OR REPLACE FUNCTION trigger_update_result_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_student_result_totals(OLD.student_result_id);
    RETURN OLD;
  ELSE
    PERFORM update_student_result_totals(NEW.student_result_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER subject_marks_update_totals
  AFTER INSERT OR UPDATE OR DELETE ON subject_marks
  FOR EACH ROW EXECUTE FUNCTION trigger_update_result_totals();
`;

export const fixResultSessionsUniqueConstraint = () => `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_school_exam'
    ) THEN
        ALTER TABLE result_sessions ADD CONSTRAINT unique_school_exam UNIQUE (school_id, exam_id);
    END IF;
END $$;
`;

// ============================================
// 12. HOMEWORK
// ============================================
export const homework = () => `
CREATE TABLE IF NOT EXISTS homework(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  teacher_id UUID NOT NULL REFERENCES teachers(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_homework(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homework_id UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN('pending', 'completed', 'submitted', 'late')),
  submission_text TEXT,
  submission_url TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(homework_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_homework_class_section ON homework(class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_homework_teacher ON homework(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_homework_student ON student_homework(student_id);
`;

// ============================================
// MIGRATIONS & PATCHES
// ============================================
export const addBloodGroupToProfiles = () => `
--Ensure blood_group_type exists(it might if students table was created)
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'blood_group_type') THEN
        CREATE TYPE blood_group_type AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
    END IF;
END $$;

--Add blood_group to user_profiles if missing
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'blood_group') THEN
        ALTER TABLE user_profiles ADD COLUMN blood_group blood_group_type;
    END IF;
END $$;

--Optional: Move data if it exists in students(and then remove column)
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'blood_group') THEN
--Transfer data
        UPDATE user_profiles up
        SET blood_group = s.blood_group
        FROM students s
        WHERE up.user_id = s.user_id AND s.blood_group IS NOT NULL;

--Remove column from students
        ALTER TABLE students DROP COLUMN blood_group;
    END IF;
END $$;
`;

export const addPermissionsToUsers = () => `
--Add permissions to users if missing
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'permissions') THEN
        ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';
    END IF;
END $$;
`;

// ============================================
// 13. HOMEWORK STATUS UPDATE
// ============================================
export const updateHomeworkStatusCheck = () => `
DO $$
DECLARE constraint_name text;
BEGIN
--Find existing check constraint on status column
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'student_homework'::regclass AND contype = 'c' AND conname LIKE '%status%';

--Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE student_homework DROP CONSTRAINT ' || constraint_name;
    END IF;

--Add new constraint with additional statuses
    ALTER TABLE student_homework ADD CONSTRAINT student_homework_status_check
CHECK(status IN('pending', 'completed', 'submitted', 'late', 'not_completed', 'not_started'));
END $$;
`;

// ============================================
// 14. PAYROLL
// ============================================
export const payroll = () => `
CREATE TABLE IF NOT EXISTS payroll(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  basic_salary DECIMAL(10, 2) NOT NULL DEFAULT 0,
  allowances DECIMAL(10, 2) DEFAULT 0,
  deductions DECIMAL(10, 2) DEFAULT 0,
  net_salary DECIMAL(10, 2) NOT NULL,
  payment_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN('pending', 'paid', 'hold')),
  payslip_url TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_teacher ON payroll(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(month, year);
`;

// ============================================
// 15. ONESIGNAL INTEGRATION
// ============================================
export const addOneSignalIdToUsers = () => `
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onesignal_player_id') THEN
        ALTER TABLE users ADD COLUMN onesignal_player_id TEXT;
        CREATE INDEX idx_users_onesignal_id ON users(onesignal_player_id);
    END IF;
END $$;
`;

// ============================================
// 15a. FCM INTEGRATION
// ============================================
export const addFcmTokenToUsers = () => `
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fcm_token') THEN
        ALTER TABLE users ADD COLUMN fcm_token TEXT;
        CREATE INDEX idx_users_fcm_token ON users(fcm_token);
    END IF;
END $$;
`;

// ============================================
// 16. EXAM UPDATED AT
// ============================================
export const addUpdatedAtToExams = () => `
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'exams' AND column_name = 'updated_at') THEN
        ALTER TABLE exams ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;
`;

// ============================================
// 17. ADMIT CARDS
// ============================================
export const admitCards = () => `
CREATE TABLE IF NOT EXISTS admit_cards(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'issued' CHECK(status IN('issued', 'blocked', 'revoked')),
  remarks TEXT,
  UNIQUE(exam_id, student_id)
);
`;

// ============================================
// 18. CERTIFICATE REQUESTS
// ============================================
export const certificateRequests = () => `
CREATE TYPE certificate_type AS ENUM('study', 'character', 'transfer', 'no_dues');
CREATE TYPE certificate_status AS ENUM('pending', 'accepted', 'rejected');

CREATE TABLE IF NOT EXISTS certificate_requests(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  certificate_type certificate_type NOT NULL,
  reason TEXT NOT NULL,
  status certificate_status DEFAULT 'pending',
  admin_remarks TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certificate_requests_student ON certificate_requests(student_id);
CREATE INDEX idx_certificate_requests_status ON certificate_requests(status);
`;

// ============================================
// 19. CALENDAR (HOLIDAYS & EVENTS)
// ============================================
export const calendar = () => `
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  holiday_type VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  declared_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  event_type VARCHAR(50),
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  location VARCHAR(255),
  description TEXT,
  for_classes JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_holidays_school ON holidays(school_id);
CREATE INDEX idx_holidays_academic_year ON holidays(academic_year_id);
CREATE INDEX idx_events_school ON events(school_id);
`;

// ============================================
// ALL TABLES EXPORT
// ============================================
export const allTables = [
  { name: '01_schools', sql: schools },
  { name: '02_users', sql: users },
  { name: '02a_add_blood_group_to_profiles', sql: addBloodGroupToProfiles },
  { name: '02b_add_permissions_to_users', sql: addPermissionsToUsers },
  { name: '03_academic_structure', sql: academicStructure },
  {
    name: '03a_timetable_periods', sql: () => `
    CREATE TABLE IF NOT EXISTS timetable_periods(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_break BOOLEAN DEFAULT false,
  break_name VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, period_number)
);
` },
  { name: '04_students', sql: students },
  { name: '05_attendance', sql: attendance },
  { name: '06_fees', sql: fees },
  { name: '07_teachers', sql: teachers },
  { name: '08_exams', sql: exams },
  { name: '09_notifications', sql: notifications },
  { name: '10_results_management', sql: resultsManagement },
  { name: '10a_fix_result_sessions_unique', sql: fixResultSessionsUniqueConstraint },
  { name: '11_grade_calculation_functions', sql: gradeCalculationFunctions },
  { name: '12_homework', sql: homework },
  { name: '13_update_homework_status_check', sql: updateHomeworkStatusCheck },
  { name: '14_payroll', sql: payroll },
  { name: '15_add_onesignal_id_to_users', sql: addOneSignalIdToUsers },
  { name: '15a_add_fcm_token_to_users', sql: addFcmTokenToUsers },
  { name: '16_add_updated_at_to_exams', sql: addUpdatedAtToExams },
  { name: '17_admit_cards', sql: admitCards },
  { name: '18_certificate_requests', sql: certificateRequests },
  { name: '19_calendar', sql: calendar },
];
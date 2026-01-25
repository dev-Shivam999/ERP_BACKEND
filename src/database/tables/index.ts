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

CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  document_number VARCHAR(100),
  document_name VARCHAR(255) NOT NULL,
  document_url TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class_id UUID NOT NULL REFERENCES classes(id),
  to_class_id UUID NOT NULL REFERENCES classes(id),
  from_section_id UUID REFERENCES sections(id),
  to_section_id UUID REFERENCES sections(id),
  academic_year VARCHAR(20) NOT NULL,
  promoted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  promoted_by UUID NOT NULL REFERENCES users(id)
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

CREATE TABLE IF NOT EXISTS fee_discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_type_id UUID NOT NULL REFERENCES fee_types(id),
  discount_type VARCHAR(20) NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  reason discount_reason NOT NULL,
  approved_by UUID NOT NULL REFERENCES users(id),
  valid_from DATE NOT NULL,
  valid_to DATE,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
// 9. SALARY & LEAVE
// ============================================
export const salary = () => `
CREATE TYPE leave_type AS ENUM ('casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE salary_status AS ENUM ('pending', 'processed', 'paid');

CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  basic_salary DECIMAL(10, 2) NOT NULL,
  hra_percentage DECIMAL(5, 2) DEFAULT 20,
  da_percentage DECIMAL(5, 2) DEFAULT 10,
  transport_allowance DECIMAL(10, 2) DEFAULT 0,
  special_allowance DECIMAL(10, 2) DEFAULT 0,
  pf_percentage DECIMAL(5, 2) DEFAULT 12,
  professional_tax DECIMAL(10, 2) DEFAULT 200,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salary_slips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  working_days INTEGER NOT NULL,
  present_days INTEGER NOT NULL,
  leave_days INTEGER DEFAULT 0,
  basic_salary DECIMAL(10, 2) NOT NULL,
  hra DECIMAL(10, 2) NOT NULL,
  da DECIMAL(10, 2) NOT NULL,
  transport_allowance DECIMAL(10, 2) DEFAULT 0,
  special_allowance DECIMAL(10, 2) DEFAULT 0,
  gross_salary DECIMAL(10, 2) NOT NULL,
  pf_deduction DECIMAL(10, 2) NOT NULL,
  professional_tax DECIMAL(10, 2) NOT NULL,
  other_deductions DECIMAL(10, 2) DEFAULT 0,
  total_deductions DECIMAL(10, 2) NOT NULL,
  net_salary DECIMAL(10, 2) NOT NULL,
  payment_date DATE,
  payment_mode payment_mode,
  status salary_status DEFAULT 'pending',
  generated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, month, year)
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type leave_type NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status leave_status DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// ============================================
// 10. HOLIDAYS & EVENTS
// ============================================
export const holidaysEvents = () => `
CREATE TYPE holiday_type AS ENUM ('national', 'festival', 'vacation', 'sudden', 'other');
CREATE TYPE event_type AS ENUM ('annual_day', 'sports_day', 'trip', 'parent_meeting', 'other');

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  title VARCHAR(255) NOT NULL,
  holiday_type holiday_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  is_sudden BOOLEAN DEFAULT false,
  declared_by UUID NOT NULL REFERENCES users(id),
  notify_all BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_type event_type NOT NULL,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  location VARCHAR(255),
  for_classes JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// ============================================
// 11. TIMETABLE & HOMEWORK
// ============================================
export const timetableHomework = () => `
CREATE TYPE day_of_week AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

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

CREATE TABLE IF NOT EXISTS timetable_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  teacher_id UUID REFERENCES teachers(id),
  day_of_week day_of_week NOT NULL,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, section_id, period_id, day_of_week, academic_year_id)
);

CREATE TABLE IF NOT EXISTS homework (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  attachment_url TEXT,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// ============================================
// 12. NOTIFICATIONS
// ============================================
export const notifications = () => `
CREATE TYPE notification_type AS ENUM ('attendance', 'fee_reminder', 'fee_receipt', 'result', 'holiday', 'event', 'homework', 'general');
CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE notification_target AS ENUM ('all', 'class', 'section', 'individual', 'role');

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
// MIGRATIONS & PATCHES
// ============================================
export const addBloodGroupToProfiles = () => `
-- Ensure blood_group_type exists (it might if students table was created)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blood_group_type') THEN
        CREATE TYPE blood_group_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
    END IF;
END $$;

-- Add blood_group to user_profiles if missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'blood_group') THEN
        ALTER TABLE user_profiles ADD COLUMN blood_group blood_group_type;
    END IF;
END $$;

-- Optional: Move data if it exists in students (and then remove column)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'blood_group') THEN
        -- Transfer data
        UPDATE user_profiles up
        SET blood_group = s.blood_group
        FROM students s
        WHERE up.user_id = s.user_id AND s.blood_group IS NOT NULL;
        
        -- Remove column from students
        ALTER TABLE students DROP COLUMN blood_group;
    END IF;
END $$;
`;

export const addPermissionsToUsers = () => `
-- Add permissions to users if missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'permissions') THEN
        ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';
    END IF;
END $$;
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
  { name: '04_students', sql: students },
  { name: '05_attendance', sql: attendance },
  { name: '06_fees', sql: fees },
  { name: '07_teachers', sql: teachers },
  { name: '08_exams', sql: exams },
  { name: '09_salary', sql: salary },
  { name: '10_holidays_events', sql: holidaysEvents },
  { name: '11_timetable_homework', sql: timetableHomework },
  { name: '12_notifications', sql: notifications },
];

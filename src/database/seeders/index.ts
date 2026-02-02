/**
 * Database Seeders in TypeScript
 * Seeders run only once (checked by migration table)
 */

// ============================================
// 1. SEED DEMO SCHOOL
// ============================================
export const seedSchool = () => `
-- Insert demo school
INSERT INTO schools (id, name, address, city, state, pincode, phone, email, board)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ABC Public School',
  '123 Education Street', 
  'New Delhi', 
  'Delhi', 
  '110001',
  '011-23456789',
  'info@abcschool.com',
  'CBSE'
) ON CONFLICT DO NOTHING;

-- Insert current academic year
INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '2025-26',
  '2025-04-01',
  '2026-03-31',
  true
) ON CONFLICT DO NOTHING;
`;

// ============================================
// 2. SEED CLASSES & SECTIONS
// ============================================
export const seedClasses = () => `
-- Insert classes (Nursery to Class 12)
INSERT INTO classes (school_id, name, numeric_value, display_order, monthly_fee_amount) VALUES
('00000000-0000-0000-0000-000000000001', 'Nursery', 0, 1, 2000),
('00000000-0000-0000-0000-000000000001', 'LKG', 0, 2, 2000),
('00000000-0000-0000-0000-000000000001', 'UKG', 0, 3, 2000),
('00000000-0000-0000-0000-000000000001', 'Class 1', 1, 4, 2500),
('00000000-0000-0000-0000-000000000001', 'Class 2', 2, 5, 2500),
('00000000-0000-0000-0000-000000000001', 'Class 3', 3, 6, 2500),
('00000000-0000-0000-0000-000000000001', 'Class 4', 4, 7, 3000),
('00000000-0000-0000-0000-000000000001', 'Class 5', 5, 8, 3000),
('00000000-0000-0000-0000-000000000001', 'Class 6', 6, 9, 3500),
('00000000-0000-0000-0000-000000000001', 'Class 7', 7, 10, 3500),
('00000000-0000-0000-0000-000000000001', 'Class 8', 8, 11, 4000),
('00000000-0000-0000-0000-000000000001', 'Class 9', 9, 12, 4500),
('00000000-0000-0000-0000-000000000001', 'Class 10', 10, 13, 5000),
('00000000-0000-0000-0000-000000000001', 'Class 11', 11, 14, 5500),
('00000000-0000-0000-0000-000000000001', 'Class 12', 12, 15, 6000)
ON CONFLICT DO NOTHING;

-- Insert sections A, B, C for each class
DO $$
DECLARE
  v_class_id UUID;
BEGIN
  FOR v_class_id IN SELECT id FROM classes WHERE school_id = '00000000-0000-0000-0000-000000000001' LOOP
    INSERT INTO sections (class_id, name, capacity) VALUES
      (v_class_id, 'A', 40),
      (v_class_id, 'B', 40),
      (v_class_id, 'C', 40)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Insert subjects
INSERT INTO subjects (school_id, name, code, is_optional) VALUES
('00000000-0000-0000-0000-000000000001', 'English', 'ENG', false),
('00000000-0000-0000-0000-000000000001', 'Hindi', 'HIN', false),
('00000000-0000-0000-0000-000000000001', 'Mathematics', 'MAT', false),
('00000000-0000-0000-0000-000000000001', 'Science', 'SCI', false),
('00000000-0000-0000-0000-000000000001', 'Social Science', 'SST', false),
('00000000-0000-0000-0000-000000000001', 'Computer Science', 'CS', true),
('00000000-0000-0000-0000-000000000001', 'Physical Education', 'PE', false),
('00000000-0000-0000-0000-000000000001', 'Art', 'ART', true)
ON CONFLICT DO NOTHING;
`;

// ============================================
// 3. SEED ADMIN USER
// ============================================
export const seedAdminUser = () => `
-- Create admin user (password: Admin@123)
INSERT INTO users (id, school_id, email, password_hash, phone, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'admin@abcschool.com',
  '$2b$10$8K1p/a0dR1LXMIgoEDFrwOfMQHLaaSKH4TqGFJKV.JTSA/tIAKD0W',
  '9876543210',
  'admin',
  true
) ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, first_name, last_name, gender)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'System',
  'Administrator',
  'male'
) ON CONFLICT DO NOTHING;

-- Create fee collector user
INSERT INTO users (id, school_id, email, password_hash, phone, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'fees@abcschool.com',
  '$2b$10$8K1p/a0dR1LXMIgoEDFrwOfMQHLaaSKH4TqGFJKV.JTSA/tIAKD0W',
  '9876543211',
  'fee_collector',
  true
) ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, first_name, last_name, gender)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'Fee',
  'Collector',
  'male'
) ON CONFLICT DO NOTHING;

-- Insert grade scales
INSERT INTO grade_scales (school_id, min_percentage, max_percentage, grade, grade_point, remarks) VALUES
('00000000-0000-0000-0000-000000000001', 91, 100, 'A1', 10.0, 'Outstanding'),
('00000000-0000-0000-0000-000000000001', 81, 90, 'A2', 9.0, 'Excellent'),
('00000000-0000-0000-0000-000000000001', 71, 80, 'B1', 8.0, 'Very Good'),
('00000000-0000-0000-0000-000000000001', 61, 70, 'B2', 7.0, 'Good'),
('00000000-0000-0000-0000-000000000001', 51, 60, 'C1', 6.0, 'Above Average'),
('00000000-0000-0000-0000-000000000001', 41, 50, 'C2', 5.0, 'Average'),
('00000000-0000-0000-0000-000000000001', 33, 40, 'D', 4.0, 'Below Average'),
('00000000-0000-0000-0000-000000000001', 0, 32, 'E', 0.0, 'Needs Improvement')
ON CONFLICT DO NOTHING;

-- Insert fee types
INSERT INTO fee_types (school_id, name, description, is_recurring) VALUES
('00000000-0000-0000-0000-000000000001', 'Tuition Fee', 'Monthly tuition fee', true),
('00000000-0000-0000-0000-000000000001', 'Exam Fee', 'Examination fee', true),
('00000000-0000-0000-0000-000000000001', 'Annual Fee', 'Yearly annual charges', false),
('00000000-0000-0000-0000-000000000001', 'Lab Fee', 'Laboratory charges', true),
('00000000-0000-0000-0000-000000000001', 'Library Fee', 'Library subscription', false),
('00000000-0000-0000-0000-000000000001', 'Sports Fee', 'Sports and activities', false)
ON CONFLICT DO NOTHING;

-- Insert timetable periods
INSERT INTO timetable_periods (school_id, period_number, start_time, end_time, is_break, break_name) VALUES
('00000000-0000-0000-0000-000000000001', 1, '08:00', '08:45', false, NULL),
('00000000-0000-0000-0000-000000000001', 2, '08:45', '09:30', false, NULL),
('00000000-0000-0000-0000-000000000001', 3, '09:30', '09:45', true, 'Short Break'),
('00000000-0000-0000-0000-000000000001', 4, '09:45', '10:30', false, NULL),
('00000000-0000-0000-0000-000000000001', 5, '10:30', '11:15', false, NULL),
('00000000-0000-0000-0000-000000000001', 6, '11:15', '12:00', false, NULL),
('00000000-0000-0000-0000-000000000001', 7, '12:00', '12:45', true, 'Lunch Break'),
('00000000-0000-0000-0000-000000000001', 8, '12:45', '13:30', false, NULL),
('00000000-0000-0000-0000-000000000001', 9, '13:30', '14:15', false, NULL)
ON CONFLICT DO NOTHING;
`;

// ============================================
// ALL SEEDERS EXPORT
// ============================================
export const allSeeders = [
  { name: 'seed_01_school', sql: seedSchool },
  { name: 'seed_02_classes', sql: seedClasses },
  { name: 'seed_03_admin_user', sql: seedAdminUser },
];

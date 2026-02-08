/**
 * Database Views in TypeScript
 * Views auto-update when content changes
 */

// ============================================
// ADMIN DASHBOARD VIEW
// ============================================
export const vwAdminDashboard = () => `
CREATE OR REPLACE VIEW vw_admin_dashboard AS
WITH student_stats AS (
  SELECT 
    COUNT(*) FILTER (WHERE status = 'active') as total_students,
    COUNT(*) FILTER (WHERE category = 'general') as general_students,
    COUNT(*) FILTER (WHERE category = 'obc') as obc_students,
    COUNT(*) FILTER (WHERE category IN ('sc', 'st')) as sc_st_students,
    COUNT(*) FILTER (WHERE is_govt_scholarship = true) as scholarship_students
  FROM students
),
attendance_stats AS (
  SELECT 
    COUNT(*) FILTER (WHERE status = 'present') as present_today,
    COUNT(*) FILTER (WHERE status = 'absent') as absent_today,
    COUNT(*) as total_marked
  FROM student_attendance
  WHERE date = CURRENT_DATE
),
fee_stats AS (
  SELECT 
    COALESCE(SUM(fp.amount_paid), 0) as today_collection,
    COALESCE(SUM(sf.amount_pending) FILTER (WHERE sf.status IN ('pending', 'overdue')), 0) as total_pending
  FROM student_fees sf
  LEFT JOIN fee_payments fp ON sf.id = fp.student_fee_id AND fp.payment_date = CURRENT_DATE
),
teacher_stats AS (
  SELECT COUNT(*) FILTER (WHERE status = 'active') as total_teachers
  FROM teachers
)
SELECT 
  s.total_students,
  s.general_students,
  s.obc_students,
  s.sc_st_students,
  s.scholarship_students,
  a.present_today,
  a.absent_today,
  a.total_marked,
  CASE WHEN a.total_marked > 0 
    THEN ROUND((a.present_today::DECIMAL / a.total_marked) * 100, 1)
    ELSE 0 
  END as attendance_percent,
  f.today_collection,
  f.total_pending,
  t.total_teachers
FROM student_stats s
CROSS JOIN attendance_stats a
CROSS JOIN fee_stats f
CROSS JOIN teacher_stats t;
`;

// ============================================
// CLASS ATTENDANCE SUMMARY VIEW
// ============================================
export const vwClassAttendanceSummary = () => `
CREATE OR REPLACE VIEW vw_class_attendance_summary AS
SELECT 
  c.id as class_id,
  c.name as class_name,
  sec.id as section_id,
  sec.name as section_name,
  sa.date,
  COUNT(*) as total_students,
  COUNT(*) FILTER (WHERE sa.status = 'present') as present_count,
  COUNT(*) FILTER (WHERE sa.status = 'absent') as absent_count,
  COUNT(*) FILTER (WHERE sa.status = 'late') as late_count,
  ROUND((COUNT(*) FILTER (WHERE sa.status = 'present')::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 1) as attendance_percentage
FROM student_attendance sa
JOIN students st ON sa.student_id = st.id
JOIN classes c ON sa.class_id = c.id
JOIN sections sec ON sa.section_id = sec.id
GROUP BY c.id, c.name, sec.id, sec.name, sa.date
ORDER BY sa.date DESC, c.display_order, sec.name;
`;

// ============================================
// FEE DEFAULTERS VIEW
// ============================================
export const vwFeeDefaulters = () => `
CREATE OR REPLACE VIEW vw_fee_defaulters AS
SELECT 
  s.id as student_id,
  s.admission_number,
  up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
  c.name as class_name,
  sec.name as section_name,
  s.category,
  s.is_govt_scholarship,
  SUM(sf.amount_pending) as total_pending,
  MIN(sf.due_date) as oldest_due_date,
  CURRENT_DATE - MIN(sf.due_date) as days_overdue,
  MAX(pup.first_name || ' ' || COALESCE(pup.last_name, '')) as parent_name,
  MAX(pu.phone) as parent_phone
FROM student_fees sf
JOIN students s ON sf.student_id = s.id
JOIN users u ON s.user_id = u.id
JOIN user_profiles up ON u.id = up.user_id
JOIN classes c ON s.current_class_id = c.id
JOIN sections sec ON s.section_id = sec.id
LEFT JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
LEFT JOIN parents p ON sp.parent_id = p.id
LEFT JOIN users pu ON p.user_id = pu.id
LEFT JOIN user_profiles pup ON pu.id = pup.user_id
WHERE sf.status IN ('pending', 'overdue') AND sf.amount_pending > 0
GROUP BY s.id, s.admission_number, up.first_name, up.last_name, c.name, sec.name, s.category, s.is_govt_scholarship
HAVING SUM(sf.amount_pending) > 0
ORDER BY days_overdue DESC, total_pending DESC;
`;

// ============================================
// FEE COLLECTION DAILY VIEW
// ============================================
export const vwFeeCollectionDaily = () => `
CREATE OR REPLACE VIEW vw_fee_collection_daily AS
SELECT 
  fp.payment_date as collection_date,
  COUNT(*) as total_receipts,
  SUM(fp.amount_paid) as total_collection,
  SUM(CASE WHEN fp.payment_mode = 'cash' THEN fp.amount_paid ELSE 0 END) as cash_collection,
  SUM(CASE WHEN fp.payment_mode = 'online' THEN fp.amount_paid ELSE 0 END) as online_collection,
  SUM(CASE WHEN fp.payment_mode = 'upi' THEN fp.amount_paid ELSE 0 END) as upi_collection,
  SUM(CASE WHEN fp.payment_mode = 'cheque' THEN fp.amount_paid ELSE 0 END) as cheque_collection,
  SUM(CASE WHEN fp.payment_mode = 'card' THEN fp.amount_paid ELSE 0 END) as card_collection
FROM fee_payments fp
GROUP BY fp.payment_date
ORDER BY fp.payment_date DESC;
`;

// ============================================
// STUDENT DASHBOARD VIEW
// ============================================
export const vwStudentDashboard = () => `
CREATE OR REPLACE VIEW vw_student_dashboard AS
SELECT 
  s.id as student_id,
  s.admission_number,
  up.first_name || ' ' || COALESCE(up.last_name, '') as student_name,
  up.photo_url,
  c.name as class_name,
  sec.name as section_name,
  s.roll_number,
  s.category,
  s.is_govt_scholarship,
  s.scholarship_type,
  (
    SELECT ROUND((COUNT(*) FILTER (WHERE status = 'present')::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 1)
    FROM student_attendance WHERE student_id = s.id
  ) as attendance_percentage,
  (
    SELECT COALESCE(SUM(amount_pending), 0)
    FROM student_fees WHERE student_id = s.id AND status IN ('pending', 'overdue')
  ) as pending_fees,
  (
    SELECT percentage 
    FROM report_cards rc
    JOIN exams e ON rc.exam_id = e.id
    WHERE rc.student_id = s.id AND e.is_published = true
    ORDER BY e.end_date DESC LIMIT 1
  ) as last_exam_percentage
FROM students s
JOIN users u ON s.user_id = u.id
JOIN user_profiles up ON u.id = up.user_id
JOIN classes c ON s.current_class_id = c.id
JOIN sections sec ON s.section_id = sec.id
WHERE s.status = 'active';
`;

// ============================================
// STUDENT PARENTS & FCM VIEW
// ============================================
export const vwStudentPrimaryParents = () => `
CREATE OR REPLACE VIEW vw_student_primary_parents AS
SELECT 
    s.id as student_id,
    s.current_class_id,
    s.status as student_status,
    u.school_id, 
    u.id as parent_user_id, 
    u.fcm_token as fcm_token
FROM students s
JOIN users u ON s.user_id = u.id
JOIN student_parents sp ON s.id = sp.student_id AND sp.is_primary_contact = true
JOIN parents p ON sp.parent_id = p.id;
`;

// ============================================
// ALL VIEWS EXPORT
// ============================================
export const allViews = [
  { name: 'vw_admin_dashboard', sql: vwAdminDashboard },
  { name: 'vw_class_attendance_summary', sql: vwClassAttendanceSummary },
  { name: 'vw_fee_defaulters', sql: vwFeeDefaulters },
  { name: 'vw_fee_collection_daily', sql: vwFeeCollectionDaily },
  { name: 'vw_student_dashboard', sql: vwStudentDashboard },
  { name: 'vw_student_primary_parents', sql: vwStudentPrimaryParents },
];

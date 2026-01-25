// Attendance Status
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday';

// Student Attendance
export interface StudentAttendance {
    id: string;
    student_id: string;
    class_id: string;
    section_id: string;
    date: Date;
    status: AttendanceStatus;
    late_time: string | null;
    marked_by: string;
    marked_at: Date;
    remarks: string | null;
}

// Mark Attendance Request (for a single student)
export interface MarkAttendanceRequest {
    student_id: string;
    status: AttendanceStatus;
    late_time?: string;
    remarks?: string;
}

// Bulk Attendance Request (for entire class)
export interface BulkAttendanceRequest {
    class_id: string;
    section_id: string;
    date: string;
    attendance: MarkAttendanceRequest[];
}

// Daily Attendance Summary
export interface DailyAttendanceSummary {
    date: string;
    class_id: string;
    class_name: string;
    section_id: string;
    section_name: string;
    total_students: number;
    present: number;
    absent: number;
    late: number;
    half_day: number;
    attendance_percentage: number;
    is_marked: boolean;
    marked_by: string | null;
    marked_at: Date | null;
}

// Student Attendance Report
export interface StudentAttendanceReport {
    student_id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section_name: string;
    month: number;
    year: number;
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    half_days: number;
    holidays: number;
    attendance_percentage: number;
}

// Low Attendance Alert
export interface LowAttendanceAlert {
    student_id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section_name: string;
    attendance_percentage: number;
    parent_phone: string;
}

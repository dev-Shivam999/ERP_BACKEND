import { v4 as uuidv4 } from 'uuid';

// Generate UUID
export const generateUUID = (): string => uuidv4();

// Format date to YYYY-MM-DD
export const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

// Format time to HH:MM:SS
export const formatTime = (date: Date): string => {
    return date.toTimeString().split(' ')[0];
};

// Get current academic year (e.g., "2025-26")
export const getCurrentAcademicYear = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Academic year starts in April
    if (month >= 4) {
        return `${year}-${(year + 1).toString().slice(-2)}`;
    } else {
        return `${year - 1}-${year.toString().slice(-2)}`;
    }
};

// Get month name
export const getMonthName = (month: number): string => {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
};

// Calculate age from date of birth
export const calculateAge = (dob: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }

    return age;
};

// Generate admission number (STD2025001)
export const generateAdmissionNumber = (year: number, sequence: number): string => {
    return `STD${year}${sequence.toString().padStart(4, '0')}`;
};

// Generate employee ID (EMP/2025/001)
export const generateEmployeeId = (year: number, sequence: number): string => {
    return `EMP/${year}/${sequence.toString().padStart(3, '0')}`;
};

// Generate receipt number (FEE/2025/12345)
export const generateReceiptNumber = (year: number, sequence: number): string => {
    return `FEE/${year}/${sequence.toString().padStart(5, '0')}`;
};

// Validate email
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Validate phone (Indian format)
export const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
};

// Clean phone number
export const cleanPhone = (phone: string): string => {
    return phone.replace(/\D/g, '').slice(-10);
};

// Calculate percentage
export const calculatePercentage = (obtained: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((obtained / total) * 100 * 100) / 100;
};

// Get grade from percentage
export const getGrade = (percentage: number): string => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
};

// Days between two dates
export const daysBetween = (date1: Date, date2: Date): number => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
};

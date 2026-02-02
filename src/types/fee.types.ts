// Fee Types
export type FeeFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';
export type FeeStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'waived';
export type PaymentMode = 'cash' | 'online' | 'cheque' | 'upi' | 'card';
export type DiscountReason = 'sibling' | 'merit' | 'sports' | 'staff_child' | 'govt_scheme' | 'financial_hardship' | 'other';

// Fee Type Master
export interface FeeType {
    id: string;
    school_id: string;
    name: string;
    description: string | null;
    is_recurring: boolean;
    is_optional: boolean;
}

// Fee Structure
export interface FeeStructure {
    id: string;
    class_id: string;
    fee_type_id: string;
    academic_year_id: string;
    amount: number;
    frequency: FeeFrequency;
    due_day: number;
}

// Student Fee
export interface StudentFee {
    id: string;
    student_id: string;
    fee_structure_id: string;
    month: number;
    year: number;
    original_amount: number;
    govt_concession_amount: number;
    scholarship_amount: number;
    discount_amount: number;
    amount_due: number;
    amount_paid: number;
    amount_pending: number;
    due_date: Date;
    status: FeeStatus;
    late_fee: number;
}

// Fee Payment
export interface FeePayment {
    id: string;
    student_fee_id: string;
    receipt_number: string;
    amount_paid: number;
    payment_mode: PaymentMode;
    payment_date: Date;
    cheque_number: string | null;
    cheque_date: Date | null;
    bank_name: string | null;
    transaction_id: string | null;
    collected_by: string;
    remarks: string | null;
}

// Collect Fee Request
export interface CollectFeeRequest {
    student_id: string;
    student_fee_ids: string[];
    amount: number;
    payment_mode: PaymentMode;
    cheque_number?: string;
    cheque_date?: string;
    bank_name?: string;
    transaction_id?: string;
    remarks?: string;
}

// Fee Receipt
export interface FeeReceipt {
    receipt_number: string;
    date: Date;
    student_name: string;
    admission_number: string;
    class_name: string;
    section_name: string;
    father_name: string;
    amount_paid: number;
    payment_mode: PaymentMode;
    for_month: string;
    total_fee: number;
    paid_till_date: number;
    balance: number;
    collected_by: string;
    school_name: string;
    school_address: string;
}

// Fee Dashboard Summary
export interface FeeDashboardSummary {
    today_collection: number;
    today_transactions: number;
    today_cash: number;
    today_online: number;
    today_cheque: number;
    month_collection: number;
    month_target: number;
    month_achievement_percent: number;
    year_collection: number;
    year_due: number;
    collection_rate: number;
}

// Defaulter List Item
export interface FeeDefaulter {
    student_id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section_name: string;
    total_due: number;
    days_overdue: number;
    parent_phone: string;
}

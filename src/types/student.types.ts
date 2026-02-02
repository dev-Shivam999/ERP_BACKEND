// Category types for Indian Education System
export type Category = 'general' | 'obc' | 'sc' | 'st' | 'ews';
export type Religion = 'hindu' | 'muslim' | 'christian' | 'sikh' | 'buddhist' | 'jain' | 'other';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type StudentStatus = 'active' | 'left' | 'passed_out' | 'suspended' | 'rusticated';
export type DocumentType = 'birth_certificate' | 'aadhar_card' | 'caste_certificate' | 'income_certificate' | 'transfer_certificate' | 'photo' | 'marksheet' | 'bpl_card' | 'scholarship_letter' | 'other';

// Student interface
export interface Student {
    id: string;
    user_id: string;
    admission_number: string;

    // Class Information
    admission_class_id: string;
    current_class_id: string;
    section_id: string;
    roll_number: number;
    admission_date: Date;

    // Personal Details
    blood_group: BloodGroup | null;
    religion: Religion | null;
    nationality: string;
    mother_tongue: string | null;

    // Caste & Category
    caste: string | null;
    category: Category;
    is_minority: boolean;
    sub_category: string | null;

    // Government Benefits
    is_bpl: boolean;
    is_govt_scholarship: boolean;
    scholarship_type: string | null;
    scholarship_amount: number;
    govt_fee_concession_percent: number;

    // Previous School
    previous_school_name: string | null;
    previous_school_board: string | null;
    transfer_certificate_number: string | null;
    transfer_certificate_date: Date | null;
    transfer_certificate_url: string | null;

    // Status
    status: StudentStatus;
    leaving_date: Date | null;
    leaving_reason: string | null;
}

// Student Document
export interface StudentDocument {
    id: string;
    student_id: string;
    document_type: DocumentType;
    document_number: string | null;
    document_url: string;
    document_name: string;
    verified_by: string | null;
    is_verified: boolean;
    uploaded_at: Date;
    verified_at: Date | null;
}

// Create Student Request
export interface CreateStudentRequest {
    user: {
        email: string;
        password: string;
        phone: string;
    };
    profile: {
        first_name: string;
        last_name: string;
        gender: 'male' | 'female' | 'other';
        date_of_birth: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
    };
    student: {
        admission_class_id: string;
        section_id: string;
        roll_number: number;
        blood_group?: BloodGroup;
        religion?: Religion;
        nationality?: string;
        mother_tongue?: string;
        caste?: string;
        category: Category;
        is_minority?: boolean;
        sub_category?: string;
        is_bpl?: boolean;
        is_govt_scholarship?: boolean;
        scholarship_type?: string;
        scholarship_amount?: number;
        govt_fee_concession_percent?: number;
        previous_school_name?: string;
        previous_school_board?: string;
    };
    parents: {
        father?: {
            name: string;
            phone: string;
            email?: string;
            occupation?: string;
        };
        mother?: {
            name: string;
            phone: string;
            email?: string;
            occupation?: string;
        };
        guardian?: {
            name: string;
            phone: string;
            email?: string;
            occupation?: string;
            relationship: string;
        };
    };
}

// Student List Response
export interface StudentListItem {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    class_name: string;
    section_name: string;
    roll_number: number;
    category: Category;
    status: StudentStatus;
    photo_url: string | null;
}

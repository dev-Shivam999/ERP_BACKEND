// User Roles
export type UserRole = 'admin' | 'management' | 'teacher' | 'fee_collector' | 'student' | 'parent';

// User interface
export interface User {
    id: string;
    school_id: string;
    email: string;
    password_hash: string;
    phone: string;
    role: UserRole;
    permissions: Record<string, boolean>;
    is_active: boolean;
    last_login: Date | null;
    created_at: Date;
    updated_at: Date;
}

// User Profile
export interface UserProfile {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    gender: 'male' | 'female' | 'other';
    date_of_birth: Date;
    address: string;
    city: string;
    state: string;
    pincode: string;
    photo_url: string | null;
    aadhar_number: string | null;
    pan_number: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
}

// JWT Payload
export interface JwtPayload {
    userId: string;
    schoolId: string;
    role: UserRole;
    email: string;
    permissions?: Record<string, boolean>;
}

// Login Request
export interface LoginRequest {
    email: string;
    password: string;
}

// Login Response
export interface LoginResponse {
    success: boolean;
    message: string;
    token?: string;
    user?: {
        id: string;
        email: string;
        role: UserRole;
        permissions: Record<string, boolean>;
        profile: UserProfile | null;
    };
}

// Create User Request
export interface CreateUserRequest {
    email: string;
    password: string;
    phone: string;
    role: UserRole;
    profile: {
        first_name: string;
        last_name: string;
        gender: 'male' | 'female' | 'other';
        date_of_birth: string;
        address?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
}

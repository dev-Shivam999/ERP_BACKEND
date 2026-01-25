import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';
import { UserRole } from '../types';

// Role-based access control middleware
export const authorize = (...allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            errorResponse(res, 'Authentication required.', 401);
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            errorResponse(
                res,
                `Access denied. Required role: ${allowedRoles.join(' or ')}`,
                403
            );
            return;
        }

        next();
    };
};

// Admin only middleware
export const adminOnly = authorize('admin');

// Management access (admin + management)
export const managementAccess = authorize('admin', 'management');

// Teacher access
export const teacherAccess = authorize('admin', 'management', 'teacher');

// Fee collector access
export const feeCollectorAccess = authorize('admin', 'fee_collector');

// Student access
export const studentAccess = authorize('student');

// Parent access
export const parentAccess = authorize('parent');

// Student or Parent access
export const studentOrParentAccess = authorize('student', 'parent');

// All authenticated users
export const anyRole = authorize('admin', 'management', 'teacher', 'fee_collector', 'student', 'parent');

// Permission-based access control
export const hasPermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            errorResponse(res, 'Authentication required.', 401);
            return;
        }

        // Admins and Management have all permissions
        if (req.user.role === 'admin' || req.user.role === 'management') {
            next();
            return;
        }

        // Check for specific permission
        if (req.user.permissions?.[permission]) {
            next();
            return;
        }

        errorResponse(
            res,
            `Access denied. Permission required: ${permission}`,
            403
        );
    };
};

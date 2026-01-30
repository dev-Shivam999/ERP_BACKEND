import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { errorResponse } from '../utils/response';
import { JwtPayload, UserRole } from '../types';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

// Authentication middleware
export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            errorResponse(res, 'Access denied. No token provided.', 401);
            return;
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
        req.user = decoded;

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            errorResponse(res, 'Token expired. Please login again.', 401);
        } else if (error instanceof jwt.JsonWebTokenError) {
            errorResponse(res, 'Invalid token.', 401);
        } else {
            errorResponse(res, 'Authentication failed.', 401);
        }
    }
};

// Generate JWT token
export const generateToken = (payload: JwtPayload): string => {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn as string,
    } as jwt.SignOptions);
};

// Verify token
export const verifyToken = (token: string): JwtPayload | null => {
    try {
        return jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch {
        return null;
    }
};

// Admin-only middleware
export const isAdmin = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (req.user?.role !== 'admin') {
        errorResponse(res, 'Access denied. Admin role required.', 403);
        return;
    }
    next();
};

// Generic role authorization middleware
export const authorize = (roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            errorResponse(res, 'Authentication required', 401);
            return;
        }

        if (!roles.includes(req.user.role as UserRole)) {
            errorResponse(res, 'Access denied', 403);
            return;
        }

        next();
    };
};

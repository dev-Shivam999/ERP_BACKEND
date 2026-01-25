import { Response } from 'express';

// Standard API Response
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}

// Success Response
export const successResponse = <T>(
    res: Response,
    message: string,
    data?: T,
    statusCode: number = 200,
    meta?: ApiResponse['meta']
): Response => {
    const response: ApiResponse<T> = {
        success: true,
        message,
        data,
        meta,
    };
    return res.status(statusCode).json(response);
};

// Error Response
export const errorResponse = (
    res: Response,
    message: string,
    statusCode: number = 400,
    error?: string
): Response => {
    const response: ApiResponse = {
        success: false,
        message,
        error,
    };
    return res.status(statusCode).json(response);
};

// Pagination Helper
export const paginate = (page: number = 1, limit: number = 10) => {
    const offset = (page - 1) * limit;
    return { offset, limit };
};

// Calculate total pages
export const getTotalPages = (total: number, limit: number): number => {
    return Math.ceil(total / limit);
};

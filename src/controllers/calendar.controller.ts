import { Request, Response } from 'express';
import { query, transaction } from '../config/database';
import { successResponse, errorResponse } from '../utils';

// Get holidays
export const getHolidays = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { month, year } = req.query;

        let whereClause = 'WHERE h.school_id = $1';
        const params: any[] = [schoolId];

        if (month && year) {
            whereClause += ` AND (
                (EXTRACT(MONTH FROM h.start_date) = $2 AND EXTRACT(YEAR FROM h.start_date) = $3)
                OR (EXTRACT(MONTH FROM h.end_date) = $2 AND EXTRACT(YEAR FROM h.end_date) = $3)
            )`;
            params.push(month, year);
        }

        const result = await query(
            `SELECT h.*, ay.name as academic_year
             FROM holidays h
             LEFT JOIN academic_years ay ON h.academic_year_id = ay.id
             ${whereClause}
             ORDER BY h.start_date`,
            params
        );

        successResponse(res, 'Holidays fetched', result.rows);
    } catch (error) {
        console.error('Get holidays error:', error);
        errorResponse(res, 'Failed to fetch holidays', 500);
    }
};

// Create holiday
export const createHoliday = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const userId = req.user?.userId;
        const { title, holidayType, startDate, endDate, description } = req.body;

        // Get current academic year
        const ayResult = await query(
            `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
            [schoolId]
        );

        let academicYearId = ayResult.rows[0]?.id;

        // If no current academic year, create one
        if (!academicYearId) {
            const year = new Date().getFullYear();
            const newAy = await query(
                `INSERT INTO academic_years (school_id, name, start_date, end_date, is_current)
                 VALUES ($1, $2, $3, $4, true) RETURNING id`,
                [schoolId, `${year}-${year + 1}`, `${year}-04-01`, `${year + 1}-03-31`]
            );
            academicYearId = newAy.rows[0].id;
        }

        const result = await transaction(async (client) => {
            const hRes = await client.query(
                `INSERT INTO holidays (school_id, academic_year_id, title, holiday_type, start_date, end_date, description, declared_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [schoolId, academicYearId, title, holidayType, startDate, endDate || startDate, description, userId]
            );

            // Send notification to everyone (target_type = 'all')
            await client.query(
                `INSERT INTO notifications (school_id, title, message, notification_type, priority, target_type, created_by)
                 VALUES ($1, $2, $3, 'holiday', 'normal', 'all', $4)`,
                [
                    schoolId,
                    `छुट्टी की घोषणा: ${title} / Holiday Declared: ${title}`,
                    `विद्यालय में ${title} की छुट्टी घोषित की गई है। विवरण मोबाइल ऐप पर देखें। / A holiday has been declared for ${title}. Please check the mobile app for details.`,
                    userId
                ]
            );

            return hRes.rows[0];
        });

        successResponse(res, 'Holiday created successfully', result, 201);
    } catch (error) {
        console.error('Create holiday error:', error);
        errorResponse(res, 'Failed to create holiday', 500);
    }
};

// Delete holiday
export const deleteHoliday = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await query(`DELETE FROM holidays WHERE id = $1`, [id]);

        successResponse(res, 'Holiday deleted successfully');
    } catch (error) {
        console.error('Delete holiday error:', error);
        errorResponse(res, 'Failed to delete holiday', 500);
    }
};

// Get events
export const getEvents = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const { month, year } = req.query;

        let whereClause = 'WHERE e.school_id = $1';
        const params: any[] = [schoolId];

        if (month && year) {
            whereClause += ` AND (
                EXTRACT(MONTH FROM e.start_datetime) = $2 AND EXTRACT(YEAR FROM e.start_datetime) = $3
            )`;
            params.push(month, year);
        }

        const result = await query(
            `SELECT e.*
             FROM events e
             ${whereClause}
             ORDER BY e.start_datetime`,
            params
        );

        successResponse(res, 'Events fetched', result.rows);
    } catch (error) {
        console.error('Get events error:', error);
        errorResponse(res, 'Failed to fetch events', 500);
    }
};

// Create event
export const createEvent = async (req: Request, res: Response): Promise<void> => {
    try {
        const schoolId = req.user?.schoolId;
        const userId = req.user?.userId;
        const { title, eventType, startDatetime, endDatetime, location, description, forClasses } = req.body;

        const result = await query(
            `INSERT INTO events (school_id, title, event_type, start_datetime, end_datetime, location, description, for_classes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [schoolId, title, eventType, startDatetime, endDatetime || startDatetime, location, description, forClasses ? JSON.stringify(forClasses) : null, userId]
        );

        successResponse(res, 'Event created successfully', result.rows[0], 201);
    } catch (error) {
        console.error('Create event error:', error);
        errorResponse(res, 'Failed to create event', 500);
    }
};

// Delete event
export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await query(`DELETE FROM events WHERE id = $1`, [id]);

        successResponse(res, 'Event deleted successfully');
    } catch (error) {
        console.error('Delete event error:', error);
        errorResponse(res, 'Failed to delete event', 500);
    }
};

import { Router } from 'express';
import { authenticate } from '../middleware';
import {
    getHolidays,
    createHoliday,
    deleteHoliday,
    getEvents,
    createEvent,
    deleteEvent
} from '../controllers/calendar.controller';

const router = Router();

router.use(authenticate);

// Holidays
router.get('/holidays', getHolidays);
router.post('/holidays', createHoliday);
router.delete('/holidays/:id', deleteHoliday);

// Events
router.get('/events', getEvents);
router.post('/events', createEvent);
router.delete('/events/:id', deleteEvent);

export default router;

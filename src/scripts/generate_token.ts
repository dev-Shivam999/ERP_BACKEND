
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const secret = process.env.JWT_SECRET || 'your_jwt_secret';
const adminId = '00000000-0000-0000-0000-000000000003';
const schoolId = '00000000-0000-0000-0000-000000000001'; // Guessing school ID from typical seed, or irrelevant for generation? 
// wait, auth middleware uses userId to fetch user?
// Payload usually: { userId: ..., email: ..., role: ..., schoolId: ... }

const payload = {
    userId: adminId,
    email: 'admin@abcschool.com',
    role: 'admin',
    schoolId: schoolId // Assuming seed data school ID
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log('TOKEN:', token);

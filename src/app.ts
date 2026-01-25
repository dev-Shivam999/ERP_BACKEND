import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, testConnection } from './config';
import { notFoundHandler, errorHandler } from './middleware';

// Import routes
import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import feeRoutes from './routes/fee.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import examRoutes from './routes/exam.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import academicRoutes from './routes/academic.routes.js';
import installmentRoutes from './routes/installment.routes.js';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'School ERP API is running',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
    });
});

// API Routes

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/installments', installmentRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
    try {
        // Test database connection
        const isConnected = await testConnection();

        if (!isConnected) {
            console.error('❌ Failed to connect to database. Exiting...');
            process.exit(1);
        }

        app.listen(config.port, () => {
            console.log(`
🏫 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   School ERP System - API Server
   
   🌐 Server:     http://localhost:${config.port}
   📊 Health:     http://localhost:${config.port}/health
   🔧 Environment: ${config.nodeEnv}
   📁 Database:   ${config.db.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

export default app;

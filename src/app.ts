import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, testConnection, getClient } from './config';
import { notFoundHandler, errorHandler } from './middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import attendanceRoutes from './routes/attendance.routes';
import feeRoutes from './routes/fee.routes';
import dashboardRoutes from './routes/dashboard.routes';
import teacherRoutes from './routes/teacher.routes';
import examRoutes from './routes/exam.routes';
import calendarRoutes from './routes/calendar.routes';
import academicRoutes from './routes/academic.routes';
import installmentRoutes from './routes/installment.routes';
import resultRoutes from './routes/result.routes';
import homeworkRoutes from './routes/homework.routes';
import payrollRoutes from './routes/payroll.routes';
import certificateRoutes from './routes/certificate.routes';
import notificationRoutes from './routes/notification.routes';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: "*"
}));

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
app.use('/api/results', resultRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
    try {
        // Test database connection
        getClient().then(async () => {
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
        })
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

export default app;

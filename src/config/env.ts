import dotenv from 'dotenv';

dotenv.config();

// Parse DATABASE_URL if provided (for Docker/Production)
function parseDbUrl(url: string | undefined) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname,
            port: parseInt(parsed.port || '5432', 10),
            name: parsed.pathname.slice(1), // Remove leading /
            user: parsed.username,
            password: parsed.password,
        };
    } catch {
        return null;
    }
}

const dbFromUrl = parseDbUrl(process.env.DATABASE_URL);

export const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),

    db: {
        host: dbFromUrl?.host || process.env.DB_HOST || 'localhost',
        port: dbFromUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
        name: dbFromUrl?.name || process.env.DB_NAME || 'school_erp',
        user: dbFromUrl?.user || process.env.DB_USER || 'postgres',
        password: dbFromUrl?.password || process.env.DB_PASSWORD || '',
        // Full URL for libraries that need it
        url: process.env.DATABASE_URL ||
            `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'school_erp'}`,
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    school: {
        defaultAcademicYear: process.env.DEFAULT_ACADEMIC_YEAR || '2025-26',
    },

    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
};

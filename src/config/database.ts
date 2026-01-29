import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from './env';

// Create connection pool
const pool = new Pool({
    connectionString: config.db.url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Event handlers
pool.on('connect', () => {
    console.log('📦 Database connected successfully');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

// Query helper function
export const query = async <T = any>(
    text: string,
    params?: any[]
): Promise<QueryResult<any>> => {
    const start = Date.now();
    const result = await pool.query<any>(text, params);
    const duration = Date.now() - start;

    if (config.nodeEnv === 'development') {
        // console.log('🔍 Query executed:', { text: text.substring(0, 100), duration: `${duration}ms`, rows: result.rowCount });
    }

    return result;
};

// Get client for transactions
export const getClient = async (): Promise<PoolClient> => {
    const client = await pool.connect();
    return client;
};

// Transaction helper
export const transaction = async <T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
    const client = await getClient();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Test database connection
export const testConnection = async (): Promise<boolean> => {
    try {
        const result = await query('SELECT NOW()');
        console.log('✅ Database connection test successful:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Database connection test failed:', error);
        return false;
    }
};

// Close pool
export const closePool = async (): Promise<void> => {
    await pool.end();
    console.log('🔌 Database pool closed');
};

export default pool;

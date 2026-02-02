import { query, closePool } from '../config/database';

export interface MigrationRecord {
    migration_name: string;
    migration_type: 'table' | 'view' | 'procedure' | 'seed';
    checksum: string;
}

// Create migrations tracking table
export async function ensureMigrationsTable(): Promise<void> {
    await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      migration_type VARCHAR(20) NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64),
      is_active BOOLEAN DEFAULT true
    )
  `);
}

// Get executed migrations
export async function getExecutedMigrations(): Promise<MigrationRecord[]> {
    try {
        const result = await query(
            'SELECT migration_name, migration_type, checksum FROM migrations WHERE is_active = true'
        );
        return result.rows;
    } catch {
        return [];
    }
}

// Record a migration
export async function recordMigration(name: string, type: string, checksum: string): Promise<void> {
    await query(
        `INSERT INTO migrations (migration_name, migration_type, checksum) 
     VALUES ($1, $2, $3)
     ON CONFLICT (migration_name) 
     DO UPDATE SET executed_at = CURRENT_TIMESTAMP, is_active = true, checksum = $3`,
        [name, type, checksum]
    );
}

// Generate checksum for content
export function generateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// Colors for console
export const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

export const log = {
    success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
};

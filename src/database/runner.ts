/**
 * Database Runner Scripts
 * Separate runners for tables, views, procedures, seeders
 */

import { query, closePool } from '../config/database';
import {
    ensureMigrationsTable,
    getExecutedMigrations,
    recordMigration,
    generateChecksum,
    log
} from './migrationUtils';
import { allTables } from './tables';
import { allViews } from './views';
import { allProcedures } from './procedures';
import { allSeeders } from './seeders';

type MigrationType = 'table' | 'view' | 'procedure' | 'seed';

interface MigrationItem {
    name: string;
    sql: () => string;
}

// Run a single migration
async function runMigration(item: MigrationItem, type: MigrationType, forceUpdate = false): Promise<boolean> {
    const sql = item.sql();
    const checksum = generateChecksum(sql);
    const executed = await getExecutedMigrations();
    const existing = executed.find(e => e.migration_name === item.name);

    // Skip if already executed with same checksum (unless forcing update for views/procedures)
    if (existing && existing.checksum === checksum && !forceUpdate) {
        return false;
    }

    // For tables, only run if not executed before
    if (type === 'table' && existing) {
        return false;
    }

    try {
        await query(sql);
        await recordMigration(item.name, type, checksum);
        log.success(`${type}: ${item.name}`);
        return true;
    } catch (err: any) {
        log.error(`${type}: ${item.name} - ${err.message}`);
        return false;
    }
}

// ============================================
// RUN TABLES
// ============================================
export async function runTables(): Promise<void> {
    console.log('\n📦 Running Table Migrations...\n');
    await ensureMigrationsTable();

    let count = 0;
    for (const table of allTables) {
        if (await runMigration(table, 'table')) count++;
    }

    console.log(`\n✅ ${count} table migrations executed.\n`);
}

// ============================================
// RUN VIEWS
// ============================================
export async function runViews(): Promise<void> {
    console.log('\n👁️ Running Views...\n');
    await ensureMigrationsTable();

    let count = 0;
    for (const view of allViews) {
        if (await runMigration(view, 'view', true)) count++;
    }

    console.log(`\n✅ ${count} views created/updated.\n`);
}

// ============================================
// RUN PROCEDURES
// ============================================
export async function runProcedures(): Promise<void> {
    console.log('\n⚙️ Running Stored Procedures...\n');
    await ensureMigrationsTable();

    let count = 0;
    for (const proc of allProcedures) {
        if (await runMigration(proc, 'procedure', true)) count++;
    }

    console.log(`\n✅ ${count} procedures created/updated.\n`);
}

// ============================================
// RUN SEEDERS
// ============================================
export async function runSeeders(): Promise<void> {
    console.log('\n🌱 Running Seeders...\n');
    await ensureMigrationsTable();

    let count = 0;
    for (const seeder of allSeeders) {
        if (await runMigration(seeder, 'seed')) count++;
    }

    console.log(`\n✅ ${count} seeders executed.\n`);
}

// ============================================
// RUN ALL
// ============================================
export async function runAll(): Promise<void> {
    console.log('\n🚀 Running All Migrations...\n');
    await runTables();
    await runProcedures();
    await runViews();
    await runSeeders();
    console.log('✅ All migrations complete!\n');
}

// ============================================
// SHOW STATUS
// ============================================
export async function showStatus(): Promise<void> {
    console.log('\n📊 Migration Status\n');
    await ensureMigrationsTable();

    const executed = await getExecutedMigrations();

    console.log('Tables:');
    for (const t of allTables) {
        const exists = executed.find(e => e.migration_name === t.name);
        console.log(`  ${exists ? '✓' : '○'} ${t.name}`);
    }

    console.log('\nViews:');
    for (const v of allViews) {
        const existing = executed.find(e => e.migration_name === v.name);
        const checksum = generateChecksum(v.sql());
        let status = '○';
        if (existing && existing.checksum === checksum) status = '✓';
        else if (existing) status = '↻';
        console.log(`  ${status} ${v.name}`);
    }

    console.log('\nProcedures:');
    for (const p of allProcedures) {
        const existing = executed.find(e => e.migration_name === p.name);
        const checksum = generateChecksum(p.sql());
        let status = '○';
        if (existing && existing.checksum === checksum) status = '✓';
        else if (existing) status = '↻';
        console.log(`  ${status} ${p.name}`);
    }

    console.log('\nSeeders:');
    for (const s of allSeeders) {
        const exists = executed.find(e => e.migration_name === s.name);
        console.log(`  ${exists ? '✓' : '○'} ${s.name}`);
    }

    console.log('\nLegend: ✓ executed, ○ pending, ↻ needs update\n');
}

// ============================================
// CLI HANDLER
// ============================================
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'tables':
                await runTables();
                break;
            case 'views':
                await runViews();
                break;
            case 'procedures':
                await runProcedures();
                break;
            case 'seeders':
                await runSeeders();
                break;
            case 'status':
                await showStatus();
                break;
            case 'all':
            default:
                await runAll();
                break;
        }
    } catch (err: any) {
        log.error(`Migration failed: ${err.message}`);
    } finally {
        await closePool();
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

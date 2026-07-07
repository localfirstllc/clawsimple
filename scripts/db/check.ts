#!/usr/bin/env tsx
/**
 * Check Migration Status
 * 
 * Usage:
 *   pnpm tsx scripts/db/check.ts          # Uses .env
 *   pnpm tsx scripts/db/check.ts --prod   # Uses .env.production
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { config } from 'dotenv';
import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env';

console.log(`🔧 Environment: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`📄 Loading: ${envFile}\n`);

// Load environment file
config({ path: join(process.cwd(), envFile) });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(`❌ DATABASE_URL not found in ${envFile}`);
  process.exit(1);
}

// Configure Neon for WebSocket
neonConfig.fetchConnectionCache = true;

async function checkMigrations() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool });

  try {
    console.log('📊 Checking migration status...\n');
    
    // Check if __drizzle_migrations table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'drizzle' 
        AND table_name = '__drizzle_migrations'
      );
    `);
    
    if (!tableExists.rows[0]?.exists) {
      console.log('⚠️  No migration tracking table found.');
      console.log('   Database might be uninitialized or using push instead of migrate.\n');
      return;
    }
    
    // Get applied migrations
    const migrations = await db.execute(sql`
      SELECT * FROM drizzle.__drizzle_migrations 
      ORDER BY created_at ASC;
    `);
    
    console.log(`✅ Applied migrations: ${migrations.rows.length}\n`);
    
    // List all migration files
    const migrationsDir = join(process.cwd(), 'drizzle');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    console.log(`📁 Available migration files: ${files.length}\n`);

    const fileMigrations = files.map((file) => {
      const content = readFileSync(join(migrationsDir, file));
      return {
        file,
        hash: createHash('sha256').update(content).digest('hex'),
      };
    });

    const appliedHashes = new Set(
      migrations.rows
        .map((migration) => String(migration.hash ?? ''))
        .filter(Boolean),
    );
    const fileHashes = new Set(fileMigrations.map((migration) => migration.hash));
    const missingFiles = fileMigrations.filter((migration) => !appliedHashes.has(migration.hash));
    const extraApplied = migrations.rows.filter((migration) => {
      const hash = String(migration.hash ?? '');
      return hash && !fileHashes.has(hash);
    });
    
    // Compare
    const appliedCount = migrations.rows.length;
    const availableCount = files.length;
    
    if (missingFiles.length === 0 && extraApplied.length === 0) {
      if (appliedCount === availableCount) {
        console.log('✅ Database is up to date!');
      } else {
        console.log('✅ All local migration hashes are applied.');
        console.log('⚠️  Migration counts differ because migration metadata has duplicate rows.');
      }
    } else if (missingFiles.length > 0) {
      console.log(`⚠️  ${missingFiles.length} pending migration file(s)`);
      for (const migration of missingFiles) {
        console.log(`   - ${migration.file} (${migration.hash.substring(0, 12)}...)`);
      }
      console.log(`\n   Run: pnpm db:migrate${isProd ? ':prod' : ''}`);
    } else {
      console.log(`⚠️  ${extraApplied.length} applied migration record(s) have no local file.`);
      console.log('   This is migration metadata drift, not necessarily schema drift.');
    }

    if (extraApplied.length > 0) {
      console.log('\n🧾 Applied records without local files:');
      for (const migration of extraApplied) {
        const createdAt = migration.created_at ? new Date(Number(migration.created_at)).toISOString() : 'unknown';
        console.log(`   - id=${String(migration.id ?? 'unknown')} hash=${String(migration.hash).substring(0, 12)}... created_at=${createdAt}`);
      }
    }
    
    // Show recent migrations
    console.log('\n📝 Recent migrations:');
    const recent = migrations.rows.slice(-5);
    for (const m of recent) {
      const date = new Date(Number(m.created_at));
      console.log(`   - ${m.hash.substring(0, 12)}... (${date.toISOString()})`);
    }
    
  } catch (error) {
    console.error('\n❌ Check failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkMigrations();

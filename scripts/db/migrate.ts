#!/usr/bin/env tsx
/**
 * Apply Database Migrations
 * 
 * Usage:
 *   pnpm tsx scripts/db/migrate.ts          # Uses .env
 *   pnpm tsx scripts/db/migrate.ts --prod   # Uses .env.production
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { join } from 'path';

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

console.log(`🔗 Connecting to: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

// Configure Neon for WebSocket
neonConfig.fetchConnectionCache = true;

async function runMigrations() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool });

  try {
    console.log('🚀 Applying migrations...\n');
    
    await migrate(db, { 
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
    
    console.log('\n✅ Migrations applied successfully!');
    
    if (isProd) {
      console.log('\n⚠️  PRODUCTION database updated!');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
    
    if (isProd) {
      console.error('\n⚠️  PRODUCTION migration failed! Database may be in inconsistent state.');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

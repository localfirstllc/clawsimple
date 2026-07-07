#!/usr/bin/env tsx
/**
 * Generate Database Migration
 * 
 * Usage:
 *   pnpm tsx scripts/db/generate.ts          # Uses .env
 *   pnpm tsx scripts/db/generate.ts --prod   # Uses .env.production
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from 'dotenv';
import { join } from 'path';

const execAsync = promisify(exec);

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env';

console.log(`🔧 Environment: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`📄 Loading: ${envFile}\n`);

// Load environment file
config({ path: join(process.cwd(), envFile) });

if (!process.env.DATABASE_URL) {
  console.error(`❌ DATABASE_URL not found in ${envFile}`);
  process.exit(1);
}

async function generate() {
  try {
    console.log('🚀 Generating migration...\n');
    
    const { stdout, stderr } = await execAsync('pnpm drizzle-kit generate', {
      env: { ...process.env },
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('\n✅ Migration generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Review the generated SQL file in drizzle/');
    console.log(`   2. Run: pnpm db:migrate${isProd ? ':prod' : ''}`);
  } catch (error) {
    console.error('\n❌ Generation failed:');
    console.error(error);
    process.exit(1);
  }
}

generate();

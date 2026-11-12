import { connectPostgres, disconnectPostgres, runPostgresMigrations } from '../config/pg.js';
import { env } from '../config/env.js';
import { seedDemoDataIfEmpty } from './seedData.js';

async function run() {
  try {
    await connectPostgres();
    if (env.usePglite || process.argv.includes('--migrate')) {
      await runPostgresMigrations();
    }
    const force = process.argv.includes('--force');
    const result = await seedDemoDataIfEmpty({ force });
    console.log('[SEED] Result:', result);
  } finally {
    await disconnectPostgres();
  }
}

run();


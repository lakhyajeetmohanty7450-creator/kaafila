import http from 'http';
import { createApp } from './app.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations } from './config/pg.js';
import { env } from './config/env.js';
import { seedDemoDataIfEmpty } from './seed/seedData.js';
import { attachSocketServer } from './socket/index.js';

async function startServer() {
  try {
    await connectPostgres();

    if (env.usePglite || process.env.RUN_MIGRATIONS === 'true') {
      await runPostgresMigrations();
    }

    // Seed demo data automatically only in local/ephemeral PGlite or when explicitly opted in via AUTO_SEED_DEMO=true
    if (env.usePglite || process.env.AUTO_SEED_DEMO === 'true') {
      await seedDemoDataIfEmpty();
    }

    const app = createApp();
    const httpServer = http.createServer(app);
    attachSocketServer(httpServer);

    httpServer.listen(env.port, () => {
      console.log(`[KAAFILA API + Socket.IO] Running on http://localhost:${env.port} (${env.nodeEnv})`);
    });

    const shutdown = async () => {
      httpServer.close(async () => {
        await disconnectPostgres();
        process.exit(0);
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (err) {
    console.error('[KAAFILA API] Failed to start:', err.message);
    process.exit(1);
  }
}

startServer();

import http from 'http';
import { createApp } from './app.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations } from './config/pg.js';
import { env } from './config/env.js';
import { seedDemoDataIfEmpty } from './seed/seedData.js';
import { attachSocketServer } from './socket/index.js';
import { createGracefulShutdown } from './utils/shutdown.js';

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
    const io = attachSocketServer(httpServer);

    httpServer.on('error', (err) => {
      console.error('[KAAFILA API] HTTP server error:', err.message);
      void disconnectPostgres().finally(() => process.exit(1));
    });

    httpServer.listen(env.port, () => {
      console.log(`[KAAFILA API + Socket.IO] Running on http://localhost:${env.port} (${env.nodeEnv})`);
    });

    const shutdown = createGracefulShutdown({
      httpServer,
      io,
      disconnectDb: disconnectPostgres,
      timeoutMs: 10000,
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (err) {
    console.error('[KAAFILA API] Failed to start:', err.message);
    process.exit(1);
  }
}

startServer();

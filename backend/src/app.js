import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { getPostgresMode, queryOne } from './config/pg.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { UPLOADS_ROOT } from './middleware/upload.js';
import authRoutes from './routes/authRoutes.js';
import organisationRoutes from './routes/organisationRoutes.js';
import rideRoutes from './routes/rideRoutes.js';
import riderRoutes from './routes/riderRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import mapRoutes from './routes/mapRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.trustProxy);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: env.clientUrl.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (env.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  app.use('/api', apiLimiter);

  app.get('/api/health', async (_req, res) => {
    try {
      await queryOne('SELECT 1 AS ok');
      res.json({
        success: true,
        service: 'kaafila-api',
        database: getPostgresMode(),
        phase: 4,
        timestamp: new Date().toISOString(),
      });
    } catch (_err) {
      res.status(503).json({
        success: false,
        service: 'kaafila-api',
        database: 'disconnected',
        phase: 4,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use('/uploads', express.static(UPLOADS_ROOT));

  app.use('/api/auth', authRoutes);
  app.use('/api/organisations', organisationRoutes);
  app.use('/api/rides', rideRoutes);
  app.use('/api/riders', riderRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/connections', connectionRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/maps', mapRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/leaderboards', leaderboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

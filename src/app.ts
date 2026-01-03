import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import timeout from 'connect-timeout';
import { config } from './config/env';
import { logger } from './config/logger';
import { mongoClient } from './storage/mongo';
import { redisClient } from './storage/redis';
import { globalRateLimiter, ipRateLimiter } from './api/middleware/rate-limiter';
import { errorHandler, notFoundHandler } from './api/middleware/error-handler';
import { validateApiKey } from './api/middleware/auth';
import recommendationsRouter from './api/routes/recommendations';
import debugRouter from './api/routes/debug';
import metricsRouter from './api/routes/metrics';
import { apiRequestsTotal, apiRequestDuration } from './utils/metrics';

export function createApp(): Application {
  const app = express();

  // Request timeout
  app.use(timeout('30s'));
  app.use((req, _res, next) => {
    if (!req.timedout) next();
  });

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST'],
      maxAge: 86400, // 24 hours
    })
  );
  app.use(compression());

  // Body parsing with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging and metrics
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;

      apiRequestsTotal.inc({
        method: req.method,
        endpoint: req.path,
        status: res.statusCode,
      });

      apiRequestDuration.observe(
        {
          method: req.method,
          endpoint: req.path,
        },
        duration
      );

      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}s`,
      });
    });

    next();
  });

  // Rate limiting
  app.use(globalRateLimiter);
  app.use(ipRateLimiter);

  // Health check (no auth required)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics endpoint (no auth required)
  app.use('/metrics', metricsRouter);

  // API routes with authentication
  app.use('/v1', validateApiKey, recommendationsRouter);

  // Debug routes (admin only)
  app.use('/debug/v1', validateApiKey, debugRouter);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startServer(): Promise<void> {
  try {
    // Connect to databases
    await mongoClient.connect();
    await redisClient.connect();

    // Create and start app
    const app = createApp();

    app.listen(config.PORT, () => {
      logger.info(`🚀 Server running on port ${config.PORT}`);
      logger.info(`📊 Metrics available at http://localhost:${config.PORT}/metrics`);
      logger.info(`🏥 Health check at http://localhost:${config.PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await mongoClient.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await mongoClient.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});

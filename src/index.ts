import { startServer } from './app';
import { logger } from './config/logger';

// Entry point for API server
startServer().catch((error) => {
  logger.error('Failed to start API server', { error });
  process.exit(1);
});

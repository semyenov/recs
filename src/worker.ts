import { config } from './config/env';
import { logger } from './config/logger';
import { mongoClient } from './storage/mongo';
import { redisClient } from './storage/redis';
import { jobScheduler } from './jobs/scheduler';
import { BatchExecutor } from './jobs/batch-executor';

export async function startWorker(): Promise<void> {
  try {
    // Connect to databases
    await mongoClient.connect();
    await redisClient.connect();

    // Initialize job scheduler
    jobScheduler.initialize();

    // Create batch executor
    const batchExecutor = new BatchExecutor();

    // Register workers
    jobScheduler.registerWorker('compute-collaborative', async (job) => {
      await batchExecutor.executeCollaborativeJob(job);
    });

    jobScheduler.registerWorker('compute-association-rules', async (job) => {
      await batchExecutor.executeAssociationRulesJob(job);
    });

    jobScheduler.registerWorker('compute-hybrid', async (job) => {
      await batchExecutor.executeHybridJob(job);
    });

    // Schedule recurring jobs
    await jobScheduler.scheduleRecurringJobs();

    logger.info('✅ Worker started successfully');
    logger.info(`Worker concurrency: ${config.BULLMQ_CONCURRENCY}`);
  } catch (error) {
    logger.error('Failed to start worker', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker...');
  await jobScheduler.shutdown();
  await mongoClient.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker...');
  await jobScheduler.shutdown();
  await mongoClient.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});

// Start worker if this file is run directly
if (require.main === module) {
  startWorker().catch((error: unknown) => {
    logger.error('Failed to start worker', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    process.exit(1);
  });
}

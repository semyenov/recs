#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './app';
import { startWorker } from './worker';
import { logger } from './config/logger';
import { mongoClient } from './storage/mongo';
import { redisClient } from './storage/redis';
import { BatchExecutor } from './jobs/batch-executor';
import { Job } from 'bullmq';

const program = new Command();

// Create a minimal Job mock object for direct execution
// Note: The job parameter is unused in BatchExecutor methods (prefixed with _),
// so we only need a minimal object that satisfies the type
function createMockJob(name: string): Job {
  return {
    id: `cli-${Date.now()}`,
    name,
  } as unknown as Job;
}

async function runJob(jobName: string): Promise<void> {
  try {
    logger.info(`Starting job: ${jobName}`);

    // Connect to databases
    await mongoClient.connect();
    await redisClient.connect();

    // Create batch executor
    const batchExecutor = new BatchExecutor();

    // Create mock job object
    const job = createMockJob(jobName);

    // Execute the appropriate job
    switch (jobName) {
      case 'content-based':
        await batchExecutor.executeContentBasedJob(job);
        break;
      case 'collaborative':
        await batchExecutor.executeCollaborativeJob(job);
        break;
      case 'association-rules':
        await batchExecutor.executeAssociationRulesJob(job);
        break;
      default:
        throw new Error(
          `Unknown job name: ${jobName}. Supported jobs: content-based, collaborative, association-rules`
        );
    }

    logger.info(`✅ Job completed successfully: ${jobName}`);

    // Graceful shutdown
    await mongoClient.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Job failed: ${jobName}`, {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });

    // Cleanup on error
    try {
      await mongoClient.disconnect();
      await redisClient.disconnect();
    } catch (cleanupError) {
      logger.error('Error during cleanup', { error: cleanupError });
    }

    process.exit(1);
  }
}

// Setup graceful shutdown for job command
function setupGracefulShutdown(): void {
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    try {
      await mongoClient.disconnect();
      await redisClient.disconnect();
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

program.name('recommendations').description('Product Recommendation Service CLI').version('1.0.0');

program
  .command('server')
  .description('Start the API server')
  .action(async () => {
    try {
      await startServer();
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  });

program
  .command('worker')
  .description('Start the worker process for processing scheduled jobs')
  .action(async () => {
    try {
      await startWorker();
    } catch (error) {
      logger.error('Failed to start worker', { error });
      process.exit(1);
    }
  });

program
  .command('job')
  .description('Run a specific batch job directly')
  .argument('<job-name>', 'Job name: content-based, collaborative, or association-rules')
  .action(async (jobName: string) => {
    setupGracefulShutdown();
    await runJob(jobName);
  });

// Parse command line arguments
program.parse();

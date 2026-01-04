import { Queue, Worker, Job } from 'bullmq';
import { redisClient } from '../storage/redis';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface JobConfig {
  name: string;
  data?: unknown;
  opts?: {
    repeat?: {
      pattern?: string; // Cron pattern
      every?: number; // Milliseconds
    };
    attempts?: number;
    backoff?: {
      type: string;
      delay: number;
    };
  };
}

export class JobScheduler {
  private queue: Queue | null = null;
  private workers: Map<string, Worker> = new Map();

  initialize(): void {
    const redis = redisClient.getClient();

    this.queue = new Queue('recommendations', {
      connection: redis,
    });

    logger.info('✅ BullMQ job scheduler initialized');
  }

  async scheduleJob(jobConfig: JobConfig): Promise<void> {
    if (!this.queue) {
      throw new Error('Job scheduler not initialized');
    }

    await this.queue.add(jobConfig.name, jobConfig.data, jobConfig.opts);

    logger.info(`Scheduled job: ${jobConfig.name}`, jobConfig.opts);
  }

  async scheduleRecurringJobs(): Promise<void> {
    // Content-based recommendations: Daily at 2 AM
    await this.scheduleJob({
      name: 'compute-content-based',
      opts: {
        repeat: {
          pattern: '0 2 * * *', // Cron: 2 AM daily
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute
        },
      },
    });

    // Collaborative filtering: Hourly
    await this.scheduleJob({
      name: 'compute-collaborative',
      opts: {
        repeat: {
          every: 3600000, // 1 hour
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      },
    });

    // Association rules: Daily at 3 AM
    await this.scheduleJob({
      name: 'compute-association-rules',
      opts: {
        repeat: {
          pattern: '0 3 * * *',
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      },
    });

    logger.info('✅ Recurring jobs scheduled');
  }

  registerWorker(
    jobName: string,
    processor: (job: Job) => Promise<void>,
    concurrency: number = config.BULLMQ_CONCURRENCY
  ): void {
    const redis = redisClient.getClient();

    const worker = new Worker(
      'recommendations',
      async (job: Job) => {
        if (job.name === jobName) {
          logger.info(`Processing job: ${jobName}`, { jobId: job.id });
          await processor(job);
          logger.info(`Completed job: ${jobName}`, { jobId: job.id });
        }
      },
      {
        connection: redis,
        concurrency,
        limiter: {
          max: config.BULLMQ_MAX_JOBS_PER_WORKER,
          duration: 60000, // Per minute
        },
      }
    );

    worker.on('completed', (job: Job) => {
      logger.info(`Job completed: ${job.name}`, { jobId: job.id });
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error(`Job failed: ${job?.name}`, { jobId: job?.id, error });
    });

    this.workers.set(jobName, worker);
    logger.info(`Worker registered: ${jobName}`);
  }

  async shutdown(): Promise<void> {
    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker closed: ${name}`);
    }

    // Close queue
    if (this.queue) {
      await this.queue.close();
      logger.info('Job queue closed');
    }
  }
}

export const jobScheduler = new JobScheduler();

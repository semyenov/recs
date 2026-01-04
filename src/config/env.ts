import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Environment validation schema
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // MongoDB
  MONGODB_URI: z.string().url().startsWith('mongodb'),
  MONGODB_DB_NAME: z.string().min(1).default('recommendations'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(100),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_MAX_MEMORY: z
    .string()
    .regex(/^\d+(gb|mb)$/)
    .default('2gb'),
  REDIS_EVICTION_POLICY: z
    .enum(['allkeys-lru', 'volatile-lru', 'allkeys-lfu'])
    .default('allkeys-lru'),

  // BullMQ
  BULLMQ_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BULLMQ_MAX_JOBS_PER_WORKER: z.coerce.number().int().positive().default(100),

  // Recommendation Settings
  BATCH_SIZE: z.coerce.number().int().positive().default(10000),
  PRE_COMPUTE_TOP_N: z.coerce.number().int().positive().default(100),
  MIN_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  DIVERSITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  MIN_ORDERS_PER_PRODUCT: z.coerce.number().int().positive().default(3),
  MIN_COMMON_USERS: z.coerce.number().int().positive().default(2),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  MIN_SUPPORT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.001),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(10000),

  // CORS
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((str) => str.split(',').map((origin) => origin.trim())),

  // API Keys
  ADMIN_API_KEYS: z.string().min(1),

  // Monitoring
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().int().positive().default(9090),
});

// Validate and export
const envResult = envSchema.safeParse(process.env);

if (!envResult.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(envResult.error.format(), null, 2));
  process.exit(1);
}

export const config = {
  ...envResult.data,
  // Derived values
  isDevelopment: envResult.data.NODE_ENV === 'development',
  isProduction: envResult.data.NODE_ENV === 'production',
  isTest: envResult.data.NODE_ENV === 'test',
  adminApiKeys: envResult.data.ADMIN_API_KEYS.split(',').map((k) => k.trim()),
} as const;

export type Config = typeof config;

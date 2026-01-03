// This file MUST run before all other imports to set environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test'; // Will be overridden
process.env.LOG_LEVEL = 'error';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_DB = '1';
process.env.REDIS_MAX_MEMORY = '256mb';
process.env.REDIS_EVICTION_POLICY = 'allkeys-lru';
process.env.BULLMQ_CONCURRENCY = '1';
process.env.BULLMQ_MAX_JOBS_PER_WORKER = '10';
process.env.BATCH_SIZE = '100';
process.env.PRE_COMPUTE_TOP_N = '10';
process.env.MIN_SCORE_THRESHOLD = '0.3';
process.env.DIVERSITY_THRESHOLD = '0.6';
process.env.MIN_ORDERS_PER_PRODUCT = '2';
process.env.CONFIDENCE_THRESHOLD = '0.3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.RATE_LIMIT_GLOBAL_MAX = '10000';
process.env.ADMIN_API_KEYS = 'admin-key-123,test-key-456';
process.env.ENABLE_METRICS = 'false';
process.env.METRICS_PORT = '9091';
process.env.PORT = '3001';
process.env.MONGODB_MAX_POOL_SIZE = '10';
process.env.MONGODB_MIN_POOL_SIZE = '1';


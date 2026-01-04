import '../test/test-env';
import { config } from '../config/env';

describe('Environment Configuration', () => {
  it('should load environment variables', () => {
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBeGreaterThan(0);
    expect(config.LOG_LEVEL).toBe('error');
  });

  it('should have MongoDB configuration', () => {
    expect(config.MONGODB_URI).toContain('mongodb://');
    expect(config.MONGODB_MAX_POOL_SIZE).toBeGreaterThan(0);
    expect(config.MONGODB_MIN_POOL_SIZE).toBeGreaterThan(0);
  });

  it('should have Redis configuration', () => {
    expect(config.REDIS_HOST).toBeTruthy();
    expect(config.REDIS_PORT).toBeGreaterThan(0);
    expect(config.REDIS_DB).toBeGreaterThanOrEqual(0);
  });

  it('should have recommendation algorithm parameters', () => {
    expect(config.MIN_SCORE_THRESHOLD).toBeGreaterThan(0);
    expect(config.MIN_SCORE_THRESHOLD).toBeLessThanOrEqual(1);
    expect(config.PRE_COMPUTE_TOP_N).toBeGreaterThan(0);
    expect(config.MIN_ORDERS_PER_PRODUCT).toBeGreaterThanOrEqual(1);
    expect(config.MIN_COMMON_USERS).toBeGreaterThan(0);
  });

  it('should have rate limiting configuration', () => {
    expect(config.RATE_LIMIT_WINDOW_MS).toBeGreaterThan(0);
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBeGreaterThan(0);
    expect(config.RATE_LIMIT_GLOBAL_MAX).toBeGreaterThan(0);
  });

  it('should have BullMQ configuration', () => {
    expect(config.BULLMQ_CONCURRENCY).toBeGreaterThan(0);
    expect(config.BULLMQ_MAX_JOBS_PER_WORKER).toBeGreaterThan(0);
  });

  it('should have batch processing configuration', () => {
    expect(config.BATCH_SIZE).toBeGreaterThan(0);
  });

  it('should have diversity and confidence thresholds', () => {
    expect(config.DIVERSITY_THRESHOLD).toBeGreaterThan(0);
    expect(config.DIVERSITY_THRESHOLD).toBeLessThanOrEqual(1);
    expect(config.CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(config.CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
    expect(config.MIN_SUPPORT_THRESHOLD).toBeGreaterThan(0);
    expect(config.MIN_SUPPORT_THRESHOLD).toBeLessThanOrEqual(1);
  });

  it('should have metrics configuration', () => {
    expect(config.ENABLE_METRICS).toBeDefined();
    expect(config.METRICS_PORT).toBeGreaterThan(0);
  });

  it('should have collaborative filtering optimization configuration', () => {
    expect(config.ENABLE_PARALLEL_CF).toBeDefined();
    expect(typeof config.ENABLE_PARALLEL_CF).toBe('boolean');
    expect(config.cfParallelWorkers).toBeGreaterThan(0);
  });

  it('should have admin API keys', () => {
    expect(config.adminApiKeys).toBeDefined();
    expect(Array.isArray(config.adminApiKeys)).toBe(true);
    expect(config.adminApiKeys.length).toBeGreaterThan(0);
  });
});

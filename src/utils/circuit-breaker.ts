import CircuitBreaker from 'opossum';
import { logger } from '../config/logger';

interface CircuitBreakerOptions {
  timeout: number; // ms
  errorThresholdPercentage: number;
  resetTimeout: number; // ms
  rollingCountTimeout: number; // ms
  rollingCountBuckets: number;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 5000, // 5 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000, // 30 seconds
  rollingCountTimeout: 10000, // 10 seconds
  rollingCountBuckets: 10,
};

export function createCircuitBreaker<T, R>(
  fn: (...args: T[]) => Promise<R>,
  name: string,
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreaker<T[], R> {
  const breaker = new CircuitBreaker(fn, {
    ...defaultOptions,
    ...options,
  });

  breaker.on('open', () => {
    logger.warn(`Circuit breaker opened: ${name}`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker half-open: ${name}`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker closed: ${name}`);
  });

  breaker.on('fallback', (result: unknown) => {
    logger.warn(`Circuit breaker fallback triggered: ${name}`, { result });
  });

  return breaker;
}

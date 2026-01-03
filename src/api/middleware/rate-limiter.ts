import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../../storage/redis';
import { config } from '../../config/env';

// Global rate limiter
export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_GLOBAL_MAX,
  message: 'Too many requests from this origin, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-IP rate limiter
export const ipRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are not perfectly aligned
    client: redisClient.getClient(),
    prefix: 'rl:ip:',
  }),
  keyGenerator: (req): string => {
    return req.ip || 'unknown';
  },
});

// Debug endpoint rate limiter (stricter)
export const debugRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many debug requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are not perfectly aligned
    client: redisClient.getClient(),
    prefix: 'rl:debug:',
  }),
});

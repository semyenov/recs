import { createClient, RedisClientType } from 'redis';
import { config } from '../config/env';
import { logger } from '../config/logger';

class RedisClient {
  private client: RedisClientType | null = null;

  async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: config.REDIS_HOST,
          port: config.REDIS_PORT,
        },
        password: config.REDIS_PASSWORD || undefined,
        database: config.REDIS_DB,
      });

      this.client.on('error', (error: Error) => {
        logger.error('Redis client error', { error });
      });

      this.client.on('connect', () => {
        logger.info('Redis connecting...');
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis connected successfully');
      });

      await this.client.connect();

      // Configure Redis memory settings
      await this.configureMemory();
    } catch (error) {
      logger.error('❌ Redis connection failed', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis disconnected');
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  private async configureMemory(): Promise<void> {
    if (!this.client) return;

    try {
      // Set max memory
      await this.client.configSet('maxmemory', config.REDIS_MAX_MEMORY);

      // Set eviction policy
      await this.client.configSet('maxmemory-policy', config.REDIS_EVICTION_POLICY);

      logger.info('✅ Redis memory configuration applied', {
        maxMemory: config.REDIS_MAX_MEMORY,
        evictionPolicy: config.REDIS_EVICTION_POLICY,
      });
    } catch (error) {
      logger.warn('⚠️  Could not configure Redis memory (requires admin privileges)', { error });
    }
  }

  // Helper methods
  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();
    return await client.keys(pattern);
  }
}

// Export singleton instance
export const redisClient = new RedisClient();

import { MongoClient, Db } from 'mongodb';
import { config } from '../config/env';
import { logger } from '../config/logger';

class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(config.MONGODB_URI, {
        maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
        minPoolSize: config.MONGODB_MIN_POOL_SIZE,
      });

      await this.client.connect();
      this.db = this.client.db();

      // Create indexes
      await this.createIndexes();

      logger.info('✅ MongoDB connected successfully');
    } catch (error) {
      logger.error('❌ MongoDB connection failed', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      logger.info('MongoDB disconnected');
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) return;

    // Products collection indexes
    await this.db
      .collection('products')
      .createIndexes([
        { key: { _id: 1 } },
        { key: { category: 1 } },
        { key: { categoryId: 1 } },
        { key: { categoryName: 1 } },
        { key: { brand: 1 } },
        { key: { updatedAt: -1 } },
        { key: { updated: -1 } },
      ]);

    // Orders collection indexes
    await this.db.collection('orders').createIndexes([
      { key: { _id: 1 } },
      { key: { contragentId: 1 } },
      { key: { date: -1 } },
      { key: { saleDate: -1 } },
      { key: { status: 1 } },
      { key: { deleted: 1 } },
      { key: { enabled: 1 } },
      { key: { contragentId: 1, date: -1 } },
      // Note: products object keys cannot be directly indexed
      // Queries for products use $expr with $objectToArray
    ]);

    // Recommendations collection indexes
    await this.db
      .collection('recommendations')
      .createIndexes([
        { key: { productId: 1, version: 1 }, unique: true },
        { key: { algorithmType: 1 } },
        { key: { version: 1 } },
        { key: { batchId: 1 } },
        { key: { createdAt: -1 } },
      ]);

    logger.info('✅ MongoDB indexes created successfully');
  }
}

// Export singleton instance
export const mongoClient = new MongoDBClient();

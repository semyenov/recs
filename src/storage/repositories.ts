import { mongoClient } from './mongo';
import { Product, Order, Recommendation, CategoryStats } from '../types';
import { logger } from '../config/logger';

export class ProductRepository {
  async findById(productId: string): Promise<Product | null> {
    const db = mongoClient.getDb();
    return await db.collection<Product>('products').findOne({ productId });
  }

  async findByCategory(category: string): Promise<Product[]> {
    const db = mongoClient.getDb();
    return await db.collection<Product>('products').find({ category }).toArray();
  }

  async findAll(limit?: number): Promise<Product[]> {
    const db = mongoClient.getDb();
    const query = db.collection<Product>('products').find();
    if (limit) {
      query.limit(limit);
    }
    return await query.toArray();
  }

  async create(product: Product): Promise<void> {
    const db = mongoClient.getDb();
    await db.collection<Product>('products').insertOne({
      ...product,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async update(productId: string, updates: Partial<Product>): Promise<void> {
    const db = mongoClient.getDb();
    await db
      .collection<Product>('products')
      .updateOne({ productId }, { $set: { ...updates, updatedAt: new Date() } });
  }

  async getCategoryStatistics(): Promise<Map<string, CategoryStats>> {
    const db = mongoClient.getDb();
    const pipeline = [
      {
        $group: {
          _id: '$category',
          sizes: { $push: '$technicalProperties.size' },
          prices: { $push: '$technicalProperties.price' },
          weights: { $push: '$technicalProperties.weight' },
          count: { $sum: 1 },
        },
      },
    ];

    const results = await db.collection<Product>('products').aggregate(pipeline).toArray();

    const statsMap = new Map<string, CategoryStats>();

    for (const result of results) {
      const sizes = result.sizes.filter((v: unknown) => typeof v === 'number') as number[];
      const prices = result.prices.filter((v: unknown) => typeof v === 'number') as number[];
      const weights = result.weights.filter((v: unknown) => typeof v === 'number') as number[];

      statsMap.set(result._id as string, {
        category: result._id as string,
        medians: {
          size: this.calculateMedian(sizes),
          price: this.calculateMedian(prices),
          weight: this.calculateMedian(weights),
        },
        counts: {
          total: result.count as number,
          withSize: sizes.length,
          withPrice: prices.length,
          withWeight: weights.length,
        },
        lastUpdated: new Date(),
      });
    }

    logger.info(`Computed category statistics for ${statsMap.size} categories`);

    return statsMap;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
}

export class OrderRepository {
  async findById(orderId: string): Promise<Order | null> {
    const db = mongoClient.getDb();
    return await db.collection<Order>('orders').findOne({ orderId });
  }

  async findByUserId(userId: string, limit?: number): Promise<Order[]> {
    const db = mongoClient.getDb();
    const query = db.collection<Order>('orders').find({ userId }).sort({ orderDate: -1 });
    if (limit) {
      query.limit(limit);
    }
    return await query.toArray();
  }

  async findByProductId(productId: string): Promise<Order[]> {
    const db = mongoClient.getDb();
    return await db.collection<Order>('orders').find({ 'items.productId': productId }).toArray();
  }

  async findAll(limit?: number): Promise<Order[]> {
    const db = mongoClient.getDb();
    const query = db.collection<Order>('orders').find();
    if (limit) {
      query.limit(limit);
    }
    return await query.toArray();
  }

  async create(order: Order): Promise<void> {
    const db = mongoClient.getDb();
    await db.collection<Order>('orders').insertOne({
      ...order,
      createdAt: new Date(),
    });
  }

  async getProductCoOccurrences(): Promise<Map<string, Map<string, number>>> {
    const db = mongoClient.getDb();
    const orders = await db.collection<Order>('orders').find().toArray();

    const coOccurrences = new Map<string, Map<string, number>>();

    for (const order of orders) {
      const productIds = order.items.map((item) => item.productId);

      // For each pair of products in the order
      for (let i = 0; i < productIds.length; i++) {
        for (let j = i + 1; j < productIds.length; j++) {
          const productA = productIds[i];
          const productB = productIds[j];

          // Add both directions
          this.incrementCoOccurrence(coOccurrences, productA, productB);
          this.incrementCoOccurrence(coOccurrences, productB, productA);
        }
      }
    }

    return coOccurrences;
  }

  private incrementCoOccurrence(
    map: Map<string, Map<string, number>>,
    productA: string,
    productB: string
  ): void {
    if (!map.has(productA)) {
      map.set(productA, new Map());
    }
    const innerMap = map.get(productA)!;
    innerMap.set(productB, (innerMap.get(productB) || 0) + 1);
  }
}

export class RecommendationRepository {
  async findByProductId(productId: string, version: string): Promise<Recommendation | null> {
    const db = mongoClient.getDb();
    return await db.collection<Recommendation>('recommendations').findOne({ productId, version });
  }

  async findByVersion(version: string, limit?: number): Promise<Recommendation[]> {
    const db = mongoClient.getDb();
    const query = db.collection<Recommendation>('recommendations').find({ version });
    if (limit) {
      query.limit(limit);
    }
    return await query.toArray();
  }

  async create(recommendation: Recommendation): Promise<void> {
    const db = mongoClient.getDb();
    await db.collection<Recommendation>('recommendations').insertOne({
      ...recommendation,
      createdAt: new Date(),
    });
  }

  async bulkUpsert(recommendations: Recommendation[]): Promise<void> {
    const db = mongoClient.getDb();
    const bulkOps = recommendations.map((rec) => ({
      updateOne: {
        filter: { productId: rec.productId, version: rec.version },
        update: {
          $set: {
            ...rec,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    await db.collection<Recommendation>('recommendations').bulkWrite(bulkOps);
    logger.info(`Bulk upserted ${recommendations.length} recommendations`);
  }

  async deleteByVersion(version: string): Promise<void> {
    const db = mongoClient.getDb();
    const result = await db.collection<Recommendation>('recommendations').deleteMany({ version });
    logger.info(`Deleted ${result.deletedCount} recommendations for version ${version}`);
  }

  async countByVersion(version: string): Promise<number> {
    const db = mongoClient.getDb();
    return await db.collection<Recommendation>('recommendations').countDocuments({ version });
  }
}

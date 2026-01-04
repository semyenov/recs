import { mongoClient } from './mongo';
import { Product, Order, Recommendation, CategoryStats } from '../types';
import { logger } from '../config/logger';

export class ProductRepository {
  /**
   * Find product by MongoDB _id
   */
  async findById(id: string): Promise<Product | null> {
    const db = mongoClient.getDb();
    const product = await db.collection<Product>('products').findOne({ _id: id });
    return product ? this.normalizeProduct(product) : null;
  }

  /**
   * Find products by category (supports both category and categoryId)
   */
  async findByCategory(category: string): Promise<Product[]> {
    const db = mongoClient.getDb();
    const products = await db
      .collection<Product>('products')
      .find({
        $or: [{ category }, { categoryId: category }, { categoryName: category }],
      })
      .toArray();
    return products.map((p) => this.normalizeProduct(p));
  }

  /**
   * Find products by brand
   */
  async findByBrand(brand: string): Promise<Product[]> {
    const db = mongoClient.getDb();
    const products = await db.collection<Product>('products').find({ brand }).toArray();
    return products.map((p) => this.normalizeProduct(p));
  }

  /**
   * Find all products with optional limit
   */
  async findAll(limit?: number): Promise<Product[]> {
    const db = mongoClient.getDb();
    const query = db.collection<Product>('products').find();
    if (limit) {
      query.limit(limit);
    }
    const products = await query.toArray();
    return products.map((p) => this.normalizeProduct(p));
  }

  /**
   * Create a new product
   */
  async create(product: Product): Promise<void> {
    const db = mongoClient.getDb();
    const normalized = this.normalizeProduct(product);
    await db.collection<Product>('products').insertOne({
      ...normalized,
      createdAt: normalized.createdAt || new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Update product by _id
   */
  async update(id: string, updates: Partial<Product>): Promise<void> {
    const db = mongoClient.getDb();
    await db
      .collection<Product>('products')
      .updateOne({ _id: id }, { $set: { ...updates, updatedAt: new Date() } });
  }

  /**
   * Normalize product (currently a no-op, kept for future extensibility)
   */
  private normalizeProduct(product: Product): Product {
    return product;
  }

  async getCategoryStatistics(): Promise<Map<string, CategoryStats>> {
    const db = mongoClient.getDb();
    // Get all products to compute statistics
    const products = await db.collection<Product>('products').find().toArray();

    const categoryData = new Map<
      string,
      {
        sizes: number[];
        prices: number[];
        weights: number[];
        count: number;
      }
    >();

    for (const product of products) {
      const normalized = this.normalizeProduct(product);
      // Use categoryId, categoryName, or category as the key
      const categoryKey =
        normalized.categoryId || normalized.categoryName || normalized.category || 'unknown';

      if (!categoryData.has(categoryKey)) {
        categoryData.set(categoryKey, { sizes: [], prices: [], weights: [], count: 0 });
      }

      const data = categoryData.get(categoryKey)!;
      data.count++;

      // Extract numeric values from attributes
      if (normalized.attributes) {
        for (const [key, attr] of Object.entries(normalized.attributes)) {
          const value = attr.value;
          if (key.toLowerCase().includes('size') || key.toLowerCase().includes('вес')) {
            if (typeof value === 'number') {
              data.sizes.push(value);
            } else if (typeof value === 'string') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue) && isFinite(numValue)) {
                data.sizes.push(numValue);
              }
            }
          }
          if (key.toLowerCase().includes('weight') || key.toLowerCase().includes('масс')) {
            if (typeof value === 'number') {
              data.weights.push(value);
            } else if (typeof value === 'string') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue) && isFinite(numValue)) {
                data.weights.push(numValue);
              }
            }
          }
        }
      }

      // Extract price from prices object (use first non-zero price)
      if (normalized.prices) {
        const priceValues: number[] = [];
        for (const p of Object.values(normalized.prices)) {
          if (typeof p === 'number' && p > 0) {
            priceValues.push(p);
          }
        }
        if (priceValues.length > 0) {
          data.prices.push(Math.min(...priceValues)); // Use minimum price
        }
      }
    }

    const statsMap = new Map<string, CategoryStats>();

    for (const [category, data] of categoryData.entries()) {
      statsMap.set(category, {
        category,
        medians: {
          size: this.calculateMedian(data.sizes),
          price: this.calculateMedian(data.prices),
          weight: this.calculateMedian(data.weights),
        },
        counts: {
          total: data.count,
          withSize: data.sizes.length,
          withPrice: data.prices.length,
          withWeight: data.weights.length,
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

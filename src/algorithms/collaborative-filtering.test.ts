import '../test/test-env';
import { CollaborativeFilter } from '../algorithms/collaborative-filtering';
import { Order } from '../types';

describe('CollaborativeFilter', () => {
  let cf: CollaborativeFilter;

  beforeEach(() => {
    cf = new CollaborativeFilter();
  });

  describe('computeItemBasedSimilarity', () => {
    it('should compute similarities for products bought by same users', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
        {
          _id: '2',
          number: 'O002',
          contragentId: 'U002',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = cf.computeItemBasedSimilarity(orders);

      expect(similarities.size).toBeGreaterThan(0);
      expect(similarities.has('P001')).toBe(true);
      expect(similarities.has('P002')).toBe(true);

      const p001Similar = similarities.get('P001');
      expect(p001Similar).toBeDefined();
      expect(p001Similar![0].productId).toBe('P002');
      expect(p001Similar![0].score).toBeCloseTo(1.0, 1); // High Jaccard similarity
    });

    it('should filter by minimum common users', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      // Only 1 user, but minCommonUsers = 2 (default from config)
      const similarities = cf.computeItemBasedSimilarity(orders);

      // Should have entries but no similarities due to min threshold
      const p001Similar = similarities.get('P001');
      expect(p001Similar).toEqual([]);
    });

    it('should handle empty orders', () => {
      const similarities = cf.computeItemBasedSimilarity([]);

      expect(similarities.size).toBe(0);
    });

    it('should compute correct Jaccard similarity', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
        {
          _id: '2',
          number: 'O002',
          contragentId: 'U002',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P003: { name: 'Product 3', quantity: 1, price: 30, status: 'Отгрузить' },
          },
          summary: 40,
          date: new Date(),
          createdAt: new Date(),
        },
        {
          _id: '3',
          number: 'O003',
          contragentId: 'U003',
          products: {
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
            P003: { name: 'Product 3', quantity: 1, price: 30, status: 'Отгрузить' },
          },
          summary: 50,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = cf.computeItemBasedSimilarity(orders);

      // P001 and P002 share 1 user, but minCommonUsers = 2, so no similarity
      // P001 and P003 share 1 user, but minCommonUsers = 2, so no similarity
      // P002 and P003 share 1 user, but minCommonUsers = 2, so no similarity
      // With default minCommonUsers=2, none of these pairs meet the threshold
      const p001Similar = similarities.get('P001');
      expect(p001Similar).toBeDefined();
      // Since minCommonUsers=2 and no pair shares 2 users, similarities should be empty
      expect(p001Similar!.length).toBe(0);
    });
  });

  describe('getUserRecommendations', () => {
    it('should recommend products based on user purchase history', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
          },
          summary: 10,
          date: new Date(),
          createdAt: new Date(),
        },
        {
          _id: '2',
          number: 'O002',
          contragentId: 'U002',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
        {
          _id: '3',
          number: 'O003',
          contragentId: 'U003',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = cf.computeItemBasedSimilarity(orders);
      
      // Verify similarity was computed: P001 should have P002 as similar (they share U002 and U003)
      const p001Similar = similarities.get('P001');
      expect(p001Similar).toBeDefined();
      expect(p001Similar!.length).toBeGreaterThan(0);
      const p002Similarity = p001Similar!.find((s) => s.productId === 'P002');
      expect(p002Similarity).toBeDefined();
      expect(p002Similarity!.score).toBeGreaterThan(0);
      
      const recommendations = cf.getUserRecommendations('U001', orders, similarities, 10);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].productId).toBe('P002'); // Should recommend P002
      expect(recommendations[0].score).toBeGreaterThan(0);
    });

    it('should not recommend already purchased products', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = new Map<string, Array<{ productId: string; score: number }>>();
      similarities.set('P001', [{ productId: 'P002', score: 0.9 }]);
      similarities.set('P002', [{ productId: 'P001', score: 0.9 }]);

      const recommendations = cf.getUserRecommendations('U001', orders, similarities, 10);

      expect(recommendations.length).toBe(0); // Both products already purchased
    });

    it('should return empty array for user with no purchase history', () => {
      const orders: Order[] = [];
      const similarities = new Map<string, Array<{ productId: string; score: number }>>();

      const recommendations = cf.getUserRecommendations('U999', orders, similarities, 10);

      expect(recommendations).toEqual([]);
    });

    it('should limit results to topN', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
          },
          summary: 10,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = new Map<string, Array<{ productId: string; score: number }>>();
      similarities.set('P001', [
        { productId: 'P002', score: 0.9 },
        { productId: 'P003', score: 0.8 },
        { productId: 'P004', score: 0.7 },
      ]);

      const recommendations = cf.getUserRecommendations('U001', orders, similarities, 2);

      expect(recommendations.length).toBe(2);
      expect(recommendations[0].score).toBeGreaterThanOrEqual(recommendations[1].score);
    });

    it('should normalize scores by number of purchased products', () => {
      const orders: Order[] = [
        {
          _id: '1',
          number: 'O001',
          contragentId: 'U001',
          products: {
            P001: { name: 'Product 1', quantity: 1, price: 10, status: 'Отгрузить' },
            P002: { name: 'Product 2', quantity: 1, price: 20, status: 'Отгрузить' },
          },
          summary: 30,
          date: new Date(),
          createdAt: new Date(),
        },
      ];

      const similarities = new Map<string, Array<{ productId: string; score: number }>>();
      similarities.set('P001', [{ productId: 'P003', score: 0.8 }]);
      similarities.set('P002', [{ productId: 'P003', score: 0.6 }]);

      const recommendations = cf.getUserRecommendations('U001', orders, similarities, 10);

      // Score should be (0.8 + 0.6) / 2 = 0.7
      expect(recommendations[0].productId).toBe('P003');
      expect(recommendations[0].score).toBeCloseTo(0.7, 2);
    });
  });

  describe('Performance Benchmarks', () => {
    /**
     * Generate test data for performance testing
     */
    function generateTestOrders(
      numContragents: number,
      numProducts: number,
      ordersPerContragent: number,
      productsPerOrder: number
    ): Order[] {
      const orders: Order[] = [];
      let orderId = 1;

      for (let c = 0; c < numContragents; c++) {
        const contragentId = `U${String(c + 1).padStart(3, '0')}`;

        for (let o = 0; o < ordersPerContragent; o++) {
          const products: Record<string, { name: string; quantity: number; price: number; status: string }> = {};
          const productIndices = new Set<number>();

          // Generate unique products for this order
          while (productIndices.size < productsPerOrder) {
            const idx = Math.floor(Math.random() * numProducts);
            productIndices.add(idx);
          }

          for (const idx of productIndices) {
            const productId = `P${String(idx + 1).padStart(3, '0')}`;
            products[productId] = {
              name: `Product ${idx + 1}`,
              quantity: 1,
              price: 10 + idx,
              status: 'Отгрузить',
            };
          }

          const summary = Object.values(products).reduce((sum, p) => sum + p.price, 0);
          orders.push({
            _id: String(orderId++),
            number: `O${String(orderId).padStart(3, '0')}`,
            contragentId,
            products,
            summary,
            date: new Date(),
            createdAt: new Date(),
          });
        }
      }

      return orders;
    }

    it('should handle medium-sized catalog efficiently (100 products)', () => {
      const orders = generateTestOrders(50, 100, 5, 3);
      const startTime = Date.now();

      const similarities = cf.computeItemBasedSimilarity(orders);

      const duration = Date.now() - startTime;

      expect(similarities.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify we have top-N results per product
      for (const [, similar] of similarities) {
        expect(similar.length).toBeLessThanOrEqual(100); // PRE_COMPUTE_TOP_N default
        if (similar.length > 0) {
          // Verify sorted descending
          for (let i = 1; i < similar.length; i++) {
            expect(similar[i - 1].score).toBeGreaterThanOrEqual(similar[i].score);
          }
        }
      }
    });

    it('should handle larger catalog efficiently (500 products)', () => {
      const orders = generateTestOrders(200, 500, 3, 4);
      const startTime = Date.now();

      const similarities = cf.computeItemBasedSimilarity(orders);

      const duration = Date.now() - startTime;

      expect(similarities.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds

      // Verify memory efficiency - should only store top-N per product
      let totalStored = 0;
      for (const similar of similarities.values()) {
        totalStored += similar.length;
      }
      const maxPossible = similarities.size * 100; // PRE_COMPUTE_TOP_N
      expect(totalStored).toBeLessThanOrEqual(maxPossible);
    });

    it('should use early termination effectively', () => {
      // Create orders where many products won't meet minCommonUsers threshold
      const orders = generateTestOrders(10, 100, 2, 2);
      const startTime = Date.now();

      const similarities = cf.computeItemBasedSimilarity(orders);

      const duration = Date.now() - startTime;

      // With minCommonUsers=2 and sparse data, many comparisons should be skipped
      expect(similarities.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Should be fast due to early termination
    });

    it('should maintain correctness with heap-based top-N', () => {
      const orders = generateTestOrders(30, 50, 4, 3);

      const similarities = cf.computeItemBasedSimilarity(orders);

      // Verify each product has at most topN similarities
      for (const [productId, similar] of similarities) {
        expect(similar.length).toBeLessThanOrEqual(100); // PRE_COMPUTE_TOP_N

        // Verify all scores are valid
        for (const { productId: otherId, score } of similar) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
          expect(otherId).not.toBe(productId); // No self-similarity
        }

        // Verify sorted descending
        for (let i = 1; i < similar.length; i++) {
          expect(similar[i - 1].score).toBeGreaterThanOrEqual(similar[i].score);
        }
      }
    });
  });
});

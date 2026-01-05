import '../test/test-env';
import processChunk, {
  TopNHeap,
  optimizedIntersection,
  WorkerChunk,
} from './collaborative-filtering-worker';

describe('CollaborativeFilteringWorker', () => {
  describe('TopNHeap', () => {
    it('should create heap with maxSize', () => {
      const heap = new TopNHeap<{ score: number }>(5);
      expect(heap).toBeDefined();
    });

    it('should push items when heap is not full', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(5);
      heap.push({ productId: 'P1', score: 0.8 });
      heap.push({ productId: 'P2', score: 0.9 });
      heap.push({ productId: 'P3', score: 0.7 });

      const result = heap.toSortedArray();
      expect(result.length).toBe(3);
      expect(result[0].score).toBe(0.9); // Highest first
      expect(result[1].score).toBe(0.8);
      expect(result[2].score).toBe(0.7);
    });

    it('should replace root when heap is full and new item is better', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(3);
      
      // Fill heap with low scores
      heap.push({ productId: 'P1', score: 0.1 });
      heap.push({ productId: 'P2', score: 0.2 });
      heap.push({ productId: 'P3', score: 0.3 });

      // Add better score - should replace the worst (0.1)
      heap.push({ productId: 'P4', score: 0.9 });

      const result = heap.toSortedArray();
      expect(result.length).toBe(3);
      expect(result[0].score).toBe(0.9); // New item should be included
      expect(result[1].score).toBe(0.3);
      expect(result[2].score).toBe(0.2);
      // P1 (0.1) should be replaced
      expect(result.find((r) => r.productId === 'P1')).toBeUndefined();
    });

    it('should not replace root when heap is full and new item is worse', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(3);
      
      // Fill heap with high scores
      heap.push({ productId: 'P1', score: 0.7 });
      heap.push({ productId: 'P2', score: 0.8 });
      heap.push({ productId: 'P3', score: 0.9 });

      // Add worse score - should not replace anything
      heap.push({ productId: 'P4', score: 0.1 });

      const result = heap.toSortedArray();
      expect(result.length).toBe(3);
      expect(result[0].score).toBe(0.9);
      expect(result[1].score).toBe(0.8);
      expect(result[2].score).toBe(0.7);
      // P4 (0.1) should not be included
      expect(result.find((r) => r.productId === 'P4')).toBeUndefined();
    });

    it('should return sorted array in descending order', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(10);
      
      // Add items in random order
      heap.push({ productId: 'P1', score: 0.5 });
      heap.push({ productId: 'P2', score: 0.9 });
      heap.push({ productId: 'P3', score: 0.1 });
      heap.push({ productId: 'P4', score: 0.8 });
      heap.push({ productId: 'P5', score: 0.3 });

      const result = heap.toSortedArray();
      expect(result.length).toBe(5);
      
      // Verify descending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
      
      // Verify highest is first
      expect(result[0].score).toBe(0.9);
      expect(result[result.length - 1].score).toBe(0.1);
    });

    it('should handle empty heap', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(5);
      const result = heap.toSortedArray();
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should handle single item', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(5);
      heap.push({ productId: 'P1', score: 0.8 });
      
      const result = heap.toSortedArray();
      expect(result.length).toBe(1);
      expect(result[0].productId).toBe('P1');
      expect(result[0].score).toBe(0.8);
    });

    it('should maintain top N items correctly', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(3);
      
      // Add 10 items, but only top 3 should remain
      for (let i = 0; i < 10; i++) {
        heap.push({ productId: `P${i}`, score: i / 10 });
      }

      const result = heap.toSortedArray();
      expect(result.length).toBe(3);
      
      // Should have the top 3 scores: 0.9, 0.8, 0.7
      expect(result[0].score).toBeCloseTo(0.9, 1);
      expect(result[1].score).toBeCloseTo(0.8, 1);
      expect(result[2].score).toBeCloseTo(0.7, 1);
    });

    it('should handle items with same score', () => {
      const heap = new TopNHeap<{ productId: string; score: number }>(5);
      
      heap.push({ productId: 'P1', score: 0.5 });
      heap.push({ productId: 'P2', score: 0.5 });
      heap.push({ productId: 'P3', score: 0.5 });

      const result = heap.toSortedArray();
      expect(result.length).toBe(3);
      expect(result.every((r) => r.score === 0.5)).toBe(true);
    });
  });

  describe('optimizedIntersection', () => {
    it('should calculate intersection of two sorted arrays', () => {
      const sortedA = ['A', 'B', 'C', 'D'];
      const sortedB = ['B', 'C', 'E', 'F'];
      
      const result = optimizedIntersection(sortedA, sortedB, 0);
      
      expect(result.intersection).toBe(2); // B and C
      expect(result.earlyExit).toBe(false);
    });

    it('should return early exit false when intersection >= minCommon', () => {
      const sortedA = ['A', 'B', 'C', 'D', 'E'];
      const sortedB = ['B', 'C', 'D', 'F'];
      const minCommon = 2;
      
      const result = optimizedIntersection(sortedA, sortedB, minCommon);
      
      expect(result.intersection).toBeGreaterThanOrEqual(minCommon);
      expect(result.earlyExit).toBe(false);
    });

    it('should return early exit true when intersection < minCommon', () => {
      const sortedA = ['A', 'B', 'C'];
      const sortedB = ['D', 'E', 'F'];
      const minCommon = 2;
      
      const result = optimizedIntersection(sortedA, sortedB, minCommon);
      
      expect(result.intersection).toBe(0);
      expect(result.earlyExit).toBe(true);
    });

    it('should handle empty arrays', () => {
      const result1 = optimizedIntersection([], ['A', 'B'], 1);
      expect(result1.intersection).toBe(0);
      expect(result1.earlyExit).toBe(true);

      const result2 = optimizedIntersection(['A', 'B'], [], 1);
      expect(result2.intersection).toBe(0);
      expect(result2.earlyExit).toBe(true);

      const result3 = optimizedIntersection([], [], 1);
      expect(result3.intersection).toBe(0);
      expect(result3.earlyExit).toBe(true);
    });

    it('should handle no intersection', () => {
      const sortedA = ['A', 'B', 'C'];
      const sortedB = ['D', 'E', 'F'];
      
      const result = optimizedIntersection(sortedA, sortedB, 1);
      
      expect(result.intersection).toBe(0);
      expect(result.earlyExit).toBe(true);
    });

    it('should handle full intersection', () => {
      const sortedA = ['A', 'B', 'C'];
      const sortedB = ['A', 'B', 'C'];
      
      const result = optimizedIntersection(sortedA, sortedB, 0);
      
      expect(result.intersection).toBe(3);
      expect(result.earlyExit).toBe(false);
    });

    it('should handle arrays with different sizes', () => {
      const sortedA = ['A', 'B', 'C', 'D', 'E'];
      const sortedB = ['B', 'D'];
      
      const result = optimizedIntersection(sortedA, sortedB, 0);
      
      expect(result.intersection).toBe(2); // B and D
      expect(result.earlyExit).toBe(false);
    });

    it('should handle duplicate values correctly', () => {
      // Note: The function assumes sorted arrays with no duplicates
      // This test verifies the merge-join handles the comparison correctly
      const sortedA = ['A', 'B', 'C'];
      const sortedB = ['A', 'B', 'C'];
      
      const result = optimizedIntersection(sortedA, sortedB, 0);
      
      expect(result.intersection).toBe(3);
    });

    it('should exit early when minCommon is reached during iteration', () => {
      const sortedA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const sortedB = ['B', 'C', 'D', 'I', 'J', 'K', 'L', 'M'];
      const minCommon = 3;
      
      const result = optimizedIntersection(sortedA, sortedB, minCommon);
      
      // Should find B, C, D (3 items) and exit early
      expect(result.intersection).toBeGreaterThanOrEqual(minCommon);
      expect(result.earlyExit).toBe(false);
    });

    it('should handle partial intersection', () => {
      const sortedA = ['A', 'B', 'C', 'D'];
      const sortedB = ['B', 'C', 'E'];
      
      const result = optimizedIntersection(sortedA, sortedB, 0);
      
      expect(result.intersection).toBe(2); // B and C
      expect(result.earlyExit).toBe(false);
    });
  });

  describe('processChunk', () => {
    const createSampleChunk = (
      productIds: string[],
      productData: Record<string, { sorted: string[]; size: number }>,
      allProductIds: string[],
      startIndex: number = 0,
      minCommonUsers: number = 1,
      topN: number = 10
    ): WorkerChunk => ({
      productIds,
      productData,
      allProductIds,
      minCommonUsers,
      topN,
      startIndex,
      endIndex: startIndex + productIds.length,
    });

    it('should process chunk and compute similarities', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001', 'U002'], size: 2 },
        P002: { sorted: ['U001', 'U002'], size: 2 },
        P003: { sorted: ['U003'], size: 1 },
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002', 'P003'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P001');
      expect(results[0].similarities.length).toBeGreaterThan(0);
      
      // P001 and P002 share U001 and U002
      // Intersection: 2, Union: 2 + 2 - 2 = 2
      // Jaccard = 2/2 = 1.0 (full overlap)
      const p002Similarity = results[0].similarities.find((s) => s.productId === 'P002');
      expect(p002Similarity).toBeDefined();
      expect(p002Similarity!.score).toBeCloseTo(1.0, 1); // Full overlap
    });

    it('should filter by minCommonUsers threshold', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001'], size: 1 },
        P002: { sorted: ['U002'], size: 1 },
        P003: { sorted: ['U001', 'U002'], size: 2 },
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002', 'P003'],
        0,
        2, // minCommonUsers = 2
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P001');
      
      // P001 and P002 have no common users, so no similarity
      // P001 and P003 share only U001, but need 2 common users
      // So should have no similarities or only P003 if it meets threshold
      const similarities = results[0].similarities;
      
      // P001 has only 1 user, so it can't have 2 common users with anything
      // But wait - P001 has 1 user, P003 has 2 users, they share 1 user
      // So intersection = 1, which is < minCommonUsers (2), so it should be filtered
      expect(similarities.length).toBe(0);
    });

    it('should limit results to topN', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {};
      const allProductIds: string[] = ['P001'];

      // Create P001 with many similar products
      for (let i = 2; i <= 20; i++) {
        const productId = `P${String(i).padStart(3, '0')}`;
        allProductIds.push(productId);
        // Each product shares some users with P001, with varying overlap
        const overlap = Math.min(i - 1, 10); // Varying overlap
        productData[productId] = {
          sorted: Array.from({ length: overlap }, (_, idx) => `U${String(idx + 1).padStart(3, '0')}`),
          size: overlap,
        };
      }

      // P001 has users U001-U010
      productData['P001'] = {
        sorted: Array.from({ length: 10 }, (_, idx) => `U${String(idx + 1).padStart(3, '0')}`),
        size: 10,
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        allProductIds,
        0,
        1,
        5 // topN = 5
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P001');
      expect(results[0].similarities.length).toBeLessThanOrEqual(5);
    });

    it('should only compare with products at higher indices (upper triangle)', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001', 'U002'], size: 2 },
        P002: { sorted: ['U001', 'U002'], size: 2 },
        P003: { sorted: ['U001', 'U002'], size: 2 },
      };

      const chunk = createSampleChunk(
        ['P002'], // Process P002
        productData,
        ['P001', 'P002', 'P003'],
        1, // startIndex = 1, so P002 is at index 1
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P002');
      
      // P002 should only compare with P003 (index 2), not P001 (index 0)
      const similarities = results[0].similarities;
      expect(similarities.find((s) => s.productId === 'P001')).toBeUndefined();
      expect(similarities.find((s) => s.productId === 'P003')).toBeDefined();
    });

    it('should handle empty chunk', () => {
      const chunk = createSampleChunk([], {}, [], 0, 1, 10);

      const results = processChunk(chunk);

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    it('should handle chunk with missing product data', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001'], size: 1 },
        // P002 is missing from productData
      };

      const chunk = createSampleChunk(
        ['P001', 'P002'],
        productData,
        ['P001', 'P002'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      // Should only process P001, skip P002
      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P001');
    });

    it('should compute correct Jaccard similarity', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001', 'U002', 'U003'], size: 3 },
        P002: { sorted: ['U001', 'U002', 'U004'], size: 3 },
        // Intersection: U001, U002 (2 items)
        // Union: |A| + |B| - intersection = 3 + 3 - 2 = 4
        // Jaccard = 2/4 = 0.5
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      const p002Similarity = results[0].similarities.find((s) => s.productId === 'P002');
      expect(p002Similarity).toBeDefined();
      // Intersection: 2, Union: 3 + 3 - 2 = 4, Jaccard = 2/4 = 0.5
      expect(p002Similarity!.score).toBeCloseTo(0.5, 2);
    });

    it('should return empty similarities when no matches found', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001'], size: 1 },
        P002: { sorted: ['U002'], size: 1 }, // No overlap
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      expect(results[0].productId).toBe('P001');
      expect(results[0].similarities.length).toBe(0);
    });

    it('should handle products with insufficient common users', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001'], size: 1 },
        P002: { sorted: ['U001', 'U002'], size: 2 },
        // They share U001, but if minCommonUsers = 2, this should be filtered
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002'],
        0,
        2, // minCommonUsers = 2
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      // P001 has only 1 user, so it can't have 2 common users with P002
      // Intersection is 1, which is < 2, so should be filtered
      expect(results[0].similarities.length).toBe(0);
    });

    it('should process multiple products in chunk', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001', 'U002'], size: 2 },
        P002: { sorted: ['U001', 'U002'], size: 2 },
        P003: { sorted: ['U003'], size: 1 },
        P004: { sorted: ['U001', 'U002', 'U003'], size: 3 },
      };

      const chunk = createSampleChunk(
        ['P001', 'P002'],
        productData,
        ['P001', 'P002', 'P003', 'P004'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(2);
      expect(results[0].productId).toBe('P001');
      expect(results[1].productId).toBe('P002');
      
      // Both should have similarities
      expect(results[0].similarities.length).toBeGreaterThan(0);
      expect(results[1].similarities.length).toBeGreaterThan(0);
    });

    it('should handle products with size less than minCommonUsers', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001'], size: 1 },
        P002: { sorted: ['U002'], size: 1 },
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002'],
        0,
        2, // minCommonUsers = 2
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      // P001 has size 1 < minCommonUsers (2), so should be skipped early
      // Actually, it processes but finds no similarities
      expect(results[0].similarities.length).toBe(0);
    });

    it('should correctly calculate similarity with varying overlap', () => {
      const productData: Record<string, { sorted: string[]; size: number }> = {
        P001: { sorted: ['U001', 'U002', 'U003', 'U004', 'U005'], size: 5 },
        P002: { sorted: ['U001', 'U002', 'U006', 'U007'], size: 4 },
        // Intersection: U001, U002 (2 items)
        // Union: |A| + |B| - intersection = 5 + 4 - 2 = 7
        // Jaccard = 2/7 ≈ 0.286
      };

      const chunk = createSampleChunk(
        ['P001'],
        productData,
        ['P001', 'P002'],
        0,
        1,
        10
      );

      const results = processChunk(chunk);

      expect(results.length).toBe(1);
      const p002Similarity = results[0].similarities.find((s) => s.productId === 'P002');
      expect(p002Similarity).toBeDefined();
      // Intersection: 2, Union: 5 + 4 - 2 = 7, Jaccard = 2/7
      expect(p002Similarity!.score).toBeCloseTo(2 / 7, 2);
    });
  });
});

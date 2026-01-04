import '../test/test-env';
import { RecommendationEngine } from '../engine/recommendation-engine';

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  describe('blendRecommendations', () => {
    it('should blend recommendations from multiple algorithms', () => {
      const collaborative = [
        { productId: 'P002', score: 0.85 },
        { productId: 'P003', score: 0.75 },
      ];

      const association = [
        { productId: 'P003', score: 0.7 },
        { productId: 'P004', score: 0.6 },
      ];

      const weights = { collaborative: 0.6, association: 0.4 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      expect(blended.length).toBeGreaterThan(0);
      expect(blended[0]).toHaveProperty('productId');
      expect(blended[0]).toHaveProperty('score');
      expect(blended[0]).toHaveProperty('breakdown');
    });

    it('should calculate blended scores correctly', () => {
      const collaborative = [{ productId: 'P001', score: 0.8 }];
      const association = [{ productId: 'P001', score: 0.6 }];

      const weights = { collaborative: 0.6, association: 0.4 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      // Expected score: 0.8*0.6 + 0.6*0.4 = 0.48 + 0.24 = 0.72
      expect(blended[0].score).toBeCloseTo(0.72, 2);
    });

    it('should sort results by blended score descending', () => {
      const collaborative = [{ productId: 'P001', score: 0.9 }];
      const association: Array<{ productId: string; score: number }> = [];

      const weights = { collaborative: 1.0, association: 0.0 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      expect(blended.length).toBeGreaterThan(0);
      for (let i = 0; i < blended.length - 1; i++) {
        expect(blended[i].score).toBeGreaterThanOrEqual(blended[i + 1].score);
      }
    });

    it('should limit results to topN', () => {
      const collaborative = [
        { productId: 'P001', score: 0.9 },
        { productId: 'P002', score: 0.8 },
        { productId: 'P003', score: 0.7 },
      ];

      const association: Array<{ productId: string; score: number }> = [];

      const weights = { collaborative: 1.0, association: 0.0 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        2
      );

      expect(blended.length).toBeLessThanOrEqual(2);
      expect(blended.length).toBeGreaterThan(0);
    });

    it('should include score breakdown in results', () => {
      const collaborative = [{ productId: 'P001', score: 0.8 }];
      const association = [{ productId: 'P001', score: 0.7 }];

      const weights = { collaborative: 0.6, association: 0.4 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      expect(blended[0].breakdown).toHaveProperty('collaborative', 0.8);
      expect(blended[0].breakdown).toHaveProperty('association', 0.7);
      expect(blended[0].breakdown).toHaveProperty('blendedScore');
      expect(blended[0].breakdown).toHaveProperty('weights');
    });

    it('should always include both collaborative and association fields in breakdown', () => {
      // Test case: product only in collaborative recommendations
      const collaborative = [{ productId: 'P001', score: 0.8 }];
      const association: Array<{ productId: string; score: number }> = [];

      const weights = { collaborative: 1.0, association: 0.0 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      expect(blended.length).toBeGreaterThan(0);
      expect(blended[0].breakdown).toHaveProperty('collaborative', 0.8);
      expect(blended[0].breakdown).toHaveProperty('association');
      expect(blended[0].breakdown.association).toBeUndefined();
      expect(blended[0].breakdown).toHaveProperty('blendedScore');
      expect(blended[0].breakdown).toHaveProperty('weights');
    });

    it('should always include both collaborative and association fields when product only in association', () => {
      // Test case: product only in association recommendations
      const collaborative: Array<{ productId: string; score: number }> = [];
      const association = [{ productId: 'P001', score: 0.7 }];

      const weights = { collaborative: 0.0, association: 1.0 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      expect(blended.length).toBeGreaterThan(0);
      expect(blended[0].breakdown).toHaveProperty('collaborative');
      expect(blended[0].breakdown.collaborative).toBeUndefined();
      expect(blended[0].breakdown).toHaveProperty('association', 0.7);
      expect(blended[0].breakdown).toHaveProperty('blendedScore');
      expect(blended[0].breakdown).toHaveProperty('weights');
    });

    it('should include both fields for all products in mixed recommendations', () => {
      // Test case: some products in both, some in only one
      // Use high scores to ensure they pass MIN_SCORE_THRESHOLD (0.3)
      const collaborative = [
        { productId: 'P001', score: 0.8 },
        { productId: 'P002', score: 0.9 },
      ];
      const association = [
        { productId: 'P001', score: 0.7 },
        { productId: 'P003', score: 0.8 },
      ];

      const weights = { collaborative: 0.6, association: 0.4 };

      const blended = engine.blendRecommendations(
        collaborative,
        association,
        weights,
        10
      );

      // All results should have both fields
      for (const rec of blended) {
        expect(rec.breakdown).toHaveProperty('collaborative');
        expect(rec.breakdown).toHaveProperty('association');
        expect(rec.breakdown).toHaveProperty('blendedScore');
        expect(rec.breakdown).toHaveProperty('weights');
      }

      // P001 should have both scores (blended: 0.8*0.6 + 0.7*0.4 = 0.48 + 0.28 = 0.76)
      const p001 = blended.find((r) => r.productId === 'P001');
      expect(p001).toBeDefined();
      expect(p001!.breakdown.collaborative).toBe(0.8);
      expect(p001!.breakdown.association).toBe(0.7);

      // P002 should have collaborative but undefined association (blended: 0.9*0.6 = 0.54)
      const p002 = blended.find((r) => r.productId === 'P002');
      if (p002) {
        expect(p002.breakdown.collaborative).toBe(0.9);
        expect(p002.breakdown.association).toBeUndefined();
      }

      // P003 should have association but undefined collaborative (blended: 0.8*0.4 = 0.32)
      const p003 = blended.find((r) => r.productId === 'P003');
      if (p003) {
        expect(p003.breakdown.collaborative).toBeUndefined();
        expect(p003.breakdown.association).toBe(0.8);
      }

      // At least P001 should be present (has both scores, highest blended score)
      expect(p001).toBeDefined();
    });
  });

  describe('computeContextAwareWeights', () => {
    it('should favor association rules for users with no purchase history', () => {
      const weights = engine.computeContextAwareWeights(true, true, false);

      expect(weights.association).toBeGreaterThan(weights.collaborative);
      expect(weights.association).toBeCloseTo(0.7, 1);
    });

    it('should use balanced weights for users with purchase history', () => {
      const weights = engine.computeContextAwareWeights(true, true, true);

      expect(weights.collaborative).toBeCloseTo(0.6, 1);
      expect(weights.association).toBeCloseTo(0.4, 1);
    });

    it('should redistribute weights when some algorithms have no data', () => {
      const weights = engine.computeContextAwareWeights(false, true, true);

      expect(weights.collaborative).toBe(0);
      expect(weights.association).toBe(1.0);
    });

    it('should normalize weights to sum to 1', () => {
      const weights = engine.computeContextAwareWeights(true, true, true);

      const sum = weights.collaborative + weights.association;
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should handle case with no available algorithms', () => {
      const weights = engine.computeContextAwareWeights(false, false, true);

      // Should return equal weights even if no data
      expect(weights.collaborative).toBe(0.5);
      expect(weights.association).toBe(0.5);
    });
  });

  describe('applyNewProductBoost', () => {
    it('should boost scores for new products', () => {
      const recommendations = [
        {
          productId: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { collaborative: 1, association: 0 },
          },
        },
      ];

      const newProducts = new Set(['P001']);
      const boosted = engine.applyNewProductBoost(recommendations, newProducts, 1.5);

      expect(boosted[0].score).toBeCloseTo(1.2, 2); // 0.8 * 1.5
      expect(boosted[0].breakdown.blendedScore).toBeCloseTo(1.2, 2);
    });

    it('should not modify scores for non-new products', () => {
      const recommendations = [
        {
          productId: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { collaborative: 1, association: 0 },
          },
        },
      ];

      const newProducts = new Set(['P002']); // Different product
      const boosted = engine.applyNewProductBoost(recommendations, newProducts, 1.5);

      expect(boosted[0].score).toBeCloseTo(0.8, 2); // Unchanged
    });

    it('should apply custom boost factor', () => {
      const recommendations = [
        {
          productId: 'P001',
          score: 0.5,
          breakdown: {
            blendedScore: 0.5,
            weights: { collaborative: 1, association: 0 },
          },
        },
      ];

      const newProducts = new Set(['P001']);
      const boosted = engine.applyNewProductBoost(recommendations, newProducts, 2.0);

      expect(boosted[0].score).toBeCloseTo(1.0, 2); // 0.5 * 2.0
    });

    it('should handle empty new products set', () => {
      const recommendations = [
        {
          productId: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { collaborative: 1, association: 0 },
          },
        },
      ];

      const newProducts = new Set<string>();
      const boosted = engine.applyNewProductBoost(recommendations, newProducts, 1.5);

      expect(boosted[0].score).toBeCloseTo(0.8, 2); // Unchanged
    });
  });
});

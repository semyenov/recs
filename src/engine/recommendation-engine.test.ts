import '../test/test-env';
import { RecommendationEngine } from '../engine/recommendation-engine';

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  describe('blendRecommendations', () => {
    it('should blend recommendations from multiple algorithms', () => {
      const contentBased = [
        { _id: 'P001', score: 0.9 },
        { _id: 'P002', score: 0.8 },
      ];

      const collaborative = [
        { _id: 'P002', score: 0.85 },
        { _id: 'P003', score: 0.75 },
      ];

      const association = [
        { _id: 'P003', score: 0.7 },
        { _id: 'P004', score: 0.6 },
      ];

      const weights = { contentBased: 0.3, collaborative: 0.5, association: 0.2 };

      const blended = engine.blendRecommendations(
        contentBased,
        collaborative,
        association,
        weights,
        10
      );

      expect(blended.length).toBeGreaterThan(0);
      expect(blended[0]).toHaveProperty('_id');
      expect(blended[0]).toHaveProperty('score');
      expect(blended[0]).toHaveProperty('breakdown');
    });

    it('should calculate blended scores correctly', () => {
      const contentBased = [{ _id: 'P001', score: 1.0 }];
      const collaborative = [{ _id: 'P001', score: 0.8 }];
      const association = [{ _id: 'P001', score: 0.6 }];

      const weights = { contentBased: 0.3, collaborative: 0.5, association: 0.2 };

      const blended = engine.blendRecommendations(
        contentBased,
        collaborative,
        association,
        weights,
        10
      );

      // Expected score: 1.0*0.3 + 0.8*0.5 + 0.6*0.2 = 0.3 + 0.4 + 0.12 = 0.82
      expect(blended[0].score).toBeCloseTo(0.82, 2);
    });

    it('should sort results by blended score descending', () => {
      const contentBased = [
        { _id: 'P001', score: 0.5 },
        { _id: 'P002', score: 0.9 },
      ];

      const collaborative = [{ _id: 'P001', score: 0.9 }];
      const association: Array<{ _id: string; score: number }> = [];

      const weights = { contentBased: 0.5, collaborative: 0.5, association: 0.0 };

      const blended = engine.blendRecommendations(
        contentBased,
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
      const contentBased = [
        { _id: 'P001', score: 0.9 },
        { _id: 'P002', score: 0.8 },
        { _id: 'P003', score: 0.7 },
      ];

      const collaborative: Array<{ _id: string; score: number }> = [];
      const association: Array<{ _id: string; score: number }> = [];

      const weights = { contentBased: 1.0, collaborative: 0.0, association: 0.0 };

      const blended = engine.blendRecommendations(
        contentBased,
        collaborative,
        association,
        weights,
        2
      );

      expect(blended.length).toBeLessThanOrEqual(2);
      expect(blended.length).toBeGreaterThan(0);
    });

    it('should include score breakdown in results', () => {
      const contentBased = [{ _id: 'P001', score: 0.9 }];
      const collaborative = [{ _id: 'P001', score: 0.8 }];
      const association = [{ _id: 'P001', score: 0.7 }];

      const weights = { contentBased: 0.3, collaborative: 0.5, association: 0.2 };

      const blended = engine.blendRecommendations(
        contentBased,
        collaborative,
        association,
        weights,
        10
      );

      expect(blended[0].breakdown).toHaveProperty('contentBased', 0.9);
      expect(blended[0].breakdown).toHaveProperty('collaborative', 0.8);
      expect(blended[0].breakdown).toHaveProperty('association', 0.7);
      expect(blended[0].breakdown).toHaveProperty('blendedScore');
      expect(blended[0].breakdown).toHaveProperty('weights');
    });
  });

  describe('computeContextAwareWeights', () => {
    it('should favor content-based for users with no purchase history', () => {
      const weights = engine.computeContextAwareWeights(true, true, true, false);

      expect(weights.contentBased).toBeGreaterThan(weights.collaborative);
      expect(weights.contentBased).toBeCloseTo(0.6, 1);
    });

    it('should use balanced weights for users with purchase history', () => {
      const weights = engine.computeContextAwareWeights(true, true, true, true);

      expect(weights.contentBased).toBeCloseTo(0.3, 1);
      expect(weights.collaborative).toBeCloseTo(0.4, 1);
      expect(weights.association).toBeCloseTo(0.3, 1);
    });

    it('should redistribute weights when some algorithms have no data', () => {
      const weights = engine.computeContextAwareWeights(true, false, true, true);

      expect(weights.collaborative).toBe(0);
      expect(weights.contentBased).toBeGreaterThan(0);
      expect(weights.association).toBeGreaterThan(0);
    });

    it('should normalize weights to sum to 1', () => {
      const weights = engine.computeContextAwareWeights(true, true, true, true);

      const sum = weights.contentBased + weights.collaborative + weights.association;
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should handle case with no available algorithms', () => {
      const weights = engine.computeContextAwareWeights(false, false, false, true);

      // Should return default weights even if no data
      expect(weights.contentBased).toBeGreaterThanOrEqual(0);
      expect(weights.collaborative).toBeGreaterThanOrEqual(0);
      expect(weights.association).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyNewProductBoost', () => {
    it('should boost scores for new products', () => {
      const recommendations = [
        {
          _id: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { contentBased: 1, collaborative: 0, association: 0 },
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
          _id: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { contentBased: 1, collaborative: 0, association: 0 },
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
          _id: 'P001',
          score: 0.5,
          breakdown: {
            blendedScore: 0.5,
            weights: { contentBased: 1, collaborative: 0, association: 0 },
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
          _id: 'P001',
          score: 0.8,
          breakdown: {
            blendedScore: 0.8,
            weights: { contentBased: 1, collaborative: 0, association: 0 },
          },
        },
      ];

      const newProducts = new Set<string>();
      const boosted = engine.applyNewProductBoost(recommendations, newProducts, 1.5);

      expect(boosted[0].score).toBeCloseTo(0.8, 2); // Unchanged
    });
  });
});

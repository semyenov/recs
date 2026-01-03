import { RecommendationScore, ScoreBreakdown } from '../types';
import { config } from '../config/env';

export interface HybridWeights {
  contentBased: number;
  collaborative: number;
  association: number;
}

export class RecommendationEngine {
  /**
   * Blend recommendations from multiple algorithms using weighted linear combination
   */
  blendRecommendations(
    contentBased: Array<{ productId: string; score: number }>,
    collaborative: Array<{ productId: string; score: number }>,
    association: Array<{ productId: string; score: number }>,
    weights: HybridWeights,
    topN: number
  ): RecommendationScore[] {
    // Aggregate scores from all algorithms
    const candidateScores = new Map<string, ScoreBreakdown>();

    // Add content-based scores
    for (const { productId, score } of contentBased) {
      if (!candidateScores.has(productId)) {
        candidateScores.set(productId, {
          blendedScore: 0,
          weights,
        });
      }
      const breakdown = candidateScores.get(productId)!;
      breakdown.contentBased = score;
    }

    // Add collaborative scores
    for (const { productId, score } of collaborative) {
      if (!candidateScores.has(productId)) {
        candidateScores.set(productId, {
          blendedScore: 0,
          weights,
        });
      }
      const breakdown = candidateScores.get(productId)!;
      breakdown.collaborative = score;
    }

    // Add association scores
    for (const { productId, score } of association) {
      if (!candidateScores.has(productId)) {
        candidateScores.set(productId, {
          blendedScore: 0,
          weights,
        });
      }
      const breakdown = candidateScores.get(productId)!;
      breakdown.association = score;
    }

    // Calculate blended scores
    for (const [productId, breakdown] of candidateScores) {
      const contentScore = (breakdown.contentBased || 0) * weights.contentBased;
      const collabScore = (breakdown.collaborative || 0) * weights.collaborative;
      const assocScore = (breakdown.association || 0) * weights.association;

      breakdown.blendedScore = contentScore + collabScore + assocScore;

      candidateScores.set(productId, breakdown);
    }

    // Sort by blended score and filter by threshold
    const recommendations: RecommendationScore[] = Array.from(candidateScores.entries())
      .map(([productId, breakdown]) => ({
        productId,
        score: breakdown.blendedScore,
        breakdown,
      }))
      .filter((rec) => rec.score >= config.MIN_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    // Apply diversity constraint
    const diversified = this.applyDiversityConstraint(recommendations, config.DIVERSITY_THRESHOLD);

    return diversified.slice(0, topN);
  }

  /**
   * Context-aware weight adjustment based on data availability
   */
  computeContextAwareWeights(
    hasContentBased: boolean,
    hasCollaborative: boolean,
    hasAssociation: boolean,
    userHasPurchaseHistory: boolean
  ): HybridWeights {
    // Default weights
    let weights: HybridWeights = {
      contentBased: 0.3,
      collaborative: 0.4,
      association: 0.3,
    };

    // Cold start: no purchase history - favor content-based
    if (!userHasPurchaseHistory) {
      weights = {
        contentBased: 0.6,
        collaborative: 0.2,
        association: 0.2,
      };
    }

    // Adjust based on available data
    const availableAlgorithms = [hasContentBased, hasCollaborative, hasAssociation].filter(
      Boolean
    ).length;

    if (availableAlgorithms === 0) {
      // Fallback: equal weights
      return weights;
    }

    // Redistribute weights if some algorithms have no data
    if (!hasContentBased) {
      weights.collaborative += weights.contentBased / 2;
      weights.association += weights.contentBased / 2;
      weights.contentBased = 0;
    }

    if (!hasCollaborative) {
      weights.contentBased += weights.collaborative / 2;
      weights.association += weights.collaborative / 2;
      weights.collaborative = 0;
    }

    if (!hasAssociation) {
      weights.contentBased += weights.association / 2;
      weights.collaborative += weights.association / 2;
      weights.association = 0;
    }

    // Normalize to sum to 1
    const total = weights.contentBased + weights.collaborative + weights.association;
    if (total > 0) {
      weights.contentBased /= total;
      weights.collaborative /= total;
      weights.association /= total;
    }

    return weights;
  }

  /**
   * Apply diversity constraint to avoid too many similar products
   */
  private applyDiversityConstraint(
    recommendations: RecommendationScore[],
    diversityThreshold: number
  ): RecommendationScore[] {
    if (recommendations.length === 0) return [];

    const diversified: RecommendationScore[] = [recommendations[0]];

    for (let i = 1; i < recommendations.length; i++) {
      const candidate = recommendations[i];

      // Check if candidate is sufficiently different from already selected
      let isDiverse = true;

      for (const selected of diversified) {
        // Simple diversity check: score difference
        const scoreDiff = Math.abs(candidate.score - selected.score);
        if (scoreDiff < diversityThreshold * candidate.score) {
          isDiverse = false;
          break;
        }
      }

      if (isDiverse) {
        diversified.push(candidate);
      }
    }

    return diversified;
  }

  /**
   * Apply new product boost to recommendations
   */
  applyNewProductBoost(
    recommendations: RecommendationScore[],
    newProductIds: Set<string>,
    boostFactor: number = 1.2
  ): RecommendationScore[] {
    return recommendations.map((rec) => {
      if (newProductIds.has(rec.productId)) {
        return {
          ...rec,
          score: rec.score * boostFactor,
          breakdown: {
            ...rec.breakdown,
            blendedScore: rec.breakdown.blendedScore * boostFactor,
          },
        };
      }
      return rec;
    });
  }
}

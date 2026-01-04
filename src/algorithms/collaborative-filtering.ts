import { Order } from '../types';
import { logger } from '../config/logger';

export class CollaborativeFilter {
  /**
   * Build item-based similarity matrix using user co-occurrence
   * Returns map of _id -> list of similar products with scores
   */
  computeItemBasedSimilarity(
    orders: Order[],
    minCommonUsers: number = 2
  ): Map<string, Array<{ _id: string; score: number }>> {
    // Step 1: Build contragent-product interaction matrix
    const contragentProducts = new Map<string, Set<string>>();
    const productContragents = new Map<string, Set<string>>();

    for (const order of orders) {
      const contragentId = order.contragentId;
      const productIds = Object.keys(order.products);

      if (!contragentProducts.has(contragentId)) {
        contragentProducts.set(contragentId, new Set());
      }

      for (const productId of productIds) {
        contragentProducts.get(contragentId)!.add(productId);

        if (!productContragents.has(productId)) {
          productContragents.set(productId, new Set());
        }
        productContragents.get(productId)!.add(contragentId);
      }
    }

    // Step 2: Compute item-item similarity using Jaccard similarity
    const similarityMatrix = new Map<string, Array<{ _id: string; score: number }>>();

    const allProducts = Array.from(productContragents.keys());

    for (const productA of allProducts) {
      const contragentsA = productContragents.get(productA)!;
      const similarities: Array<{ _id: string; score: number }> = [];

      for (const productB of allProducts) {
        if (productA === productB) continue;

        const contragentsB = productContragents.get(productB)!;

        // Calculate Jaccard similarity
        const intersection = new Set([...contragentsA].filter((c) => contragentsB.has(c)));
        const union = new Set([...contragentsA, ...contragentsB]);

        if (intersection.size >= minCommonUsers) {
          const similarity = intersection.size / union.size;
          similarities.push({ _id: productB, score: similarity });
        }
      }

      // Sort by score descending
      similarities.sort((a, b) => b.score - a.score);
      similarityMatrix.set(productA, similarities);
    }

    logger.info(`Computed collaborative filtering similarity for ${allProducts.length} products`);

    return similarityMatrix;
  }

  /**
   * Get personalized recommendations for a contragent based on their order history
   */
  getUserRecommendations(
    contragentId: string,
    orders: Order[],
    similarityMatrix: Map<string, Array<{ _id: string; score: number }>>,
    topN: number
  ): Array<{ _id: string; score: number }> {
    // Get products the contragent has already purchased
    const contragentOrders = orders.filter((o) => o.contragentId === contragentId);
    const purchasedProducts = new Set<string>();

    for (const order of contragentOrders) {
      const productIds = Object.keys(order.products);
      for (const productId of productIds) {
        purchasedProducts.add(productId);
      }
    }

    // Aggregate recommendations from all purchased products
    const candidateScores = new Map<string, number>();

    for (const productId of purchasedProducts) {
      const similar = similarityMatrix.get(productId) || [];

      for (const { _id: candidateId, score } of similar) {
        // Don't recommend already purchased products
        if (purchasedProducts.has(candidateId)) continue;

        // Aggregate scores (sum)
        candidateScores.set(candidateId, (candidateScores.get(candidateId) || 0) + score);
      }
    }

    // Convert to array, normalize by number of purchased products, sort, and take top N
    const recommendations = Array.from(candidateScores.entries())
      .map(([_id, totalScore]) => ({
        _id,
        score: totalScore / purchasedProducts.size, // Normalize
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return recommendations;
  }
}

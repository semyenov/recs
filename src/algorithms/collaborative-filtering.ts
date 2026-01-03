import { Order } from '../types';
import { logger } from '../config/logger';

export class CollaborativeFilter {
  /**
   * Build item-based similarity matrix using user co-occurrence
   * Returns map of productId -> list of similar products with scores
   */
  computeItemBasedSimilarity(
    orders: Order[],
    minCommonUsers: number = 2
  ): Map<string, Array<{ productId: string; score: number }>> {
    // Step 1: Build user-product interaction matrix
    const userProducts = new Map<string, Set<string>>();
    const productUsers = new Map<string, Set<string>>();

    for (const order of orders) {
      const userId = order.userId;
      const productIds = order.items.map((item) => item.productId);

      if (!userProducts.has(userId)) {
        userProducts.set(userId, new Set());
      }

      for (const productId of productIds) {
        userProducts.get(userId)!.add(productId);

        if (!productUsers.has(productId)) {
          productUsers.set(productId, new Set());
        }
        productUsers.get(productId)!.add(userId);
      }
    }

    // Step 2: Compute item-item similarity using Jaccard similarity
    const similarityMatrix = new Map<string, Array<{ productId: string; score: number }>>();

    const allProducts = Array.from(productUsers.keys());

    for (const productA of allProducts) {
      const usersA = productUsers.get(productA)!;
      const similarities: Array<{ productId: string; score: number }> = [];

      for (const productB of allProducts) {
        if (productA === productB) continue;

        const usersB = productUsers.get(productB)!;

        // Calculate Jaccard similarity
        const intersection = new Set([...usersA].filter((u) => usersB.has(u)));
        const union = new Set([...usersA, ...usersB]);

        if (intersection.size >= minCommonUsers) {
          const similarity = intersection.size / union.size;
          similarities.push({ productId: productB, score: similarity });
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
   * Get personalized recommendations for a user based on their order history
   */
  getUserRecommendations(
    userId: string,
    orders: Order[],
    similarityMatrix: Map<string, Array<{ productId: string; score: number }>>,
    topN: number
  ): Array<{ productId: string; score: number }> {
    // Get products the user has already purchased
    const userOrders = orders.filter((o) => o.userId === userId);
    const purchasedProducts = new Set<string>();

    for (const order of userOrders) {
      for (const item of order.items) {
        purchasedProducts.add(item.productId);
      }
    }

    // Aggregate recommendations from all purchased products
    const candidateScores = new Map<string, number>();

    for (const productId of purchasedProducts) {
      const similar = similarityMatrix.get(productId) || [];

      for (const { productId: candidateId, score } of similar) {
        // Don't recommend already purchased products
        if (purchasedProducts.has(candidateId)) continue;

        // Aggregate scores (sum)
        candidateScores.set(candidateId, (candidateScores.get(candidateId) || 0) + score);
      }
    }

    // Convert to array, normalize by number of purchased products, sort, and take top N
    const recommendations = Array.from(candidateScores.entries())
      .map(([productId, totalScore]) => ({
        productId,
        score: totalScore / purchasedProducts.size, // Normalize
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return recommendations;
  }
}

import { Order } from '../types';
import { logger } from '../config/logger';
import { config } from '../config/env';

export class CollaborativeFilter {
  /**
   * Build item-based similarity matrix using user co-occurrence
   * Returns map of _id -> list of similar products with scores
   */
  computeItemBasedSimilarity(
    orders: Order[]
  ): Map<string, Array<{ productId: string; score: number }>> {
    const minCommonUsers = config.MIN_COMMON_USERS;
    logger.info(
      `[CollaborativeFilter] Starting item-based similarity computation from ${orders.length} orders (minCommonUsers: ${minCommonUsers})`
    );

    // Step 1: Build contragent-product interaction matrix
    logger.info('[CollaborativeFilter] Step 1: Building contragent-product interaction matrix');
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

    logger.info(
      `[CollaborativeFilter] Built interaction matrix: ${contragentProducts.size} contragents, ${productContragents.size} products`
    );

    // Step 2: Compute item-item similarity using Jaccard similarity
    logger.info(
      '[CollaborativeFilter] Step 2: Computing item-item similarity using Jaccard similarity'
    );
    const similarityMatrix = new Map<string, Array<{ productId: string; score: number }>>();

    const allProducts = Array.from(productContragents.keys());
    logger.info(`[CollaborativeFilter] Computing similarities for ${allProducts.length} products`);

    let processed = 0;
    const logInterval = Math.max(1, Math.floor(allProducts.length / 10)); // Log every 10%

    for (const productA of allProducts) {
      const contragentsA = productContragents.get(productA)!;
      const similarities: Array<{ productId: string; score: number }> = [];

      for (const productB of allProducts) {
        if (productA === productB) continue;

        const contragentsB = productContragents.get(productB)!;

        // Calculate Jaccard similarity
        const intersection = new Set([...contragentsA].filter((c) => contragentsB.has(c)));
        const union = new Set([...contragentsA, ...contragentsB]);

        if (intersection.size >= minCommonUsers) {
          const similarity = intersection.size / union.size;
          similarities.push({ productId: productB, score: similarity });
        }
      }

      // Sort by score descending
      similarities.sort((a, b) => b.score - a.score);
      similarityMatrix.set(productA, similarities);
      processed++;

      if (processed % logInterval === 0 || processed === allProducts.length) {
        logger.info(
          `[CollaborativeFilter] Progress: ${processed}/${allProducts.length} products processed (${Math.round((processed / allProducts.length) * 100)}%)`
        );
      }
    }

    const totalSimilarities = Array.from(similarityMatrix.values()).reduce(
      (sum, sims) => sum + sims.length,
      0
    );
    logger.info(
      `[CollaborativeFilter] Computed collaborative filtering similarity for ${allProducts.length} products (${totalSimilarities} total similarities)`
    );

    return similarityMatrix;
  }

  /**
   * Get personalized recommendations for a contragent based on their order history
   */
  getUserRecommendations(
    contragentId: string,
    orders: Order[],
    similarityMatrix: Map<string, Array<{ productId: string; score: number }>>,
    topN: number
  ): Array<{ productId: string; score: number }> {
    logger.info(
      `[CollaborativeFilter] Getting personalized recommendations for contragent ${contragentId} (topN: ${topN})`
    );

    // Get products the contragent has already purchased
    const contragentOrders = orders.filter((o) => o.contragentId === contragentId);
    logger.info(
      `[CollaborativeFilter] Found ${contragentOrders.length} orders for contragent ${contragentId}`
    );
    const purchasedProducts = new Set<string>();

    for (const order of contragentOrders) {
      const productIds = Object.keys(order.products);
      for (const productId of productIds) {
        purchasedProducts.add(productId);
      }
    }

    logger.info(
      `[CollaborativeFilter] Contragent ${contragentId} has purchased ${purchasedProducts.size} unique products`
    );

    // Aggregate recommendations from all purchased products
    logger.info('[CollaborativeFilter] Aggregating recommendations from purchased products');
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

    logger.info(
      `[CollaborativeFilter] Found ${candidateScores.size} candidate recommendations for contragent ${contragentId}`
    );

    // Convert to array, normalize by number of purchased products, sort, and take top N
    const recommendations = Array.from(candidateScores.entries())
      .map(([productId, totalScore]) => ({
        productId,
        score: totalScore / purchasedProducts.size, // Normalize,
      }))
      .sort((a, b) => b.score - a.score,)
      .slice(0, topN);

    logger.info(
      `[CollaborativeFilter] Generated ${recommendations.length} recommendations for contragent ${contragentId}`
    );

    return recommendations;
  }
}

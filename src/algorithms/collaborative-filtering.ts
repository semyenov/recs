import { Order } from '../types';
import { logger } from '../config/logger';
import { config } from '../config/env';

/**
 * Min-heap for maintaining top-N items efficiently
 */
class MinHeap<T extends { score: number }> {
  private heap: T[] = [];

  constructor(private maxSize: number) {}

  push(item: T): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    } else if (item.score > this.heap[0].score) {
      this.heap[0] = item;
      this.bubbleDown(0);
    }
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].score <= this.heap[index].score) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < this.heap.length && this.heap[left].score < this.heap[smallest].score) {
        smallest = left;
      }
      if (right < this.heap.length && this.heap[right].score < this.heap[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  toSortedArray(): T[] {
    return [...this.heap].sort((a, b) => b.score - a.score);
  }
}

/**
 * Optimized intersection using merge-join for sorted arrays
 * O(n + m) instead of O(n * m)
 */
function optimizedIntersection(
  sortedA: string[],
  sortedB: string[],
  minCommon: number
): { intersection: number; earlyExit: boolean } {
  let intersection = 0;
  let i = 0;
  let j = 0;

  while (i < sortedA.length && j < sortedB.length) {
    if (sortedA[i] === sortedB[j]) {
      intersection++;
      i++;
      j++;
      // Early exit if we've found enough common items
      if (intersection >= minCommon) {
        return { intersection, earlyExit: false };
      }
    } else if (sortedA[i] < sortedB[j]) {
      i++;
    } else {
      j++;
    }
  }

  return { intersection, earlyExit: intersection < minCommon };
}

export class CollaborativeFilter {
  /**
   * Build item-based similarity matrix using user co-occurrence
   * Returns map of _id -> list of similar products with scores
   * 
   * Optimizations:
   * - Exploits symmetry (only computes upper triangle)
   * - Uses optimized set operations (merge-join)
   * - Early termination for impossible pairs
   * - Heap-based top-N collection
   * - Optional parallelization for large catalogs
   */
  computeItemBasedSimilarity(
    orders: Order[]
  ): Map<string, Array<{ productId: string; score: number }>> {
    const minCommonUsers = config.MIN_COMMON_USERS;
    const topN = config.PRE_COMPUTE_TOP_N;
    const enableParallel = config.ENABLE_PARALLEL_CF;
    const productCountThreshold = 10000; // Use parallel for 10K+ products

    logger.info(
      `[CollaborativeFilter] Starting optimized item-based similarity computation from ${orders.length} orders (minCommonUsers: ${minCommonUsers}, topN: ${topN})`
    );

    // Step 1: Build contragent-product interaction matrix
    logger.info('[CollaborativeFilter] Step 1: Building contragent-product interaction matrix');
    const productContragents = new Map<string, Set<string>>();

    for (const order of orders) {
      const contragentId = order.contragentId;
      const productIds = Object.keys(order.products);

      for (const productId of productIds) {
        if (!productContragents.has(productId)) {
          productContragents.set(productId, new Set());
        }
        productContragents.get(productId)!.add(contragentId);
      }
    }

    const allProducts = Array.from(productContragents.keys());
    logger.info(
      `[CollaborativeFilter] Built interaction matrix: ${productContragents.size} products`
    );

    // Decide whether to use parallel processing
    const shouldUseParallel = enableParallel && allProducts.length >= productCountThreshold;

    if (shouldUseParallel) {
      logger.info(
        `[CollaborativeFilter] Using parallel processing with ${config.cfParallelWorkers} workers`
      );
      return this.computeItemBasedSimilarityParallel(allProducts, productContragents, minCommonUsers, topN);
    }

    return this.computeItemBasedSimilaritySequential(allProducts, productContragents, minCommonUsers, topN);
  }

  /**
   * Sequential optimized computation
   */
  private computeItemBasedSimilaritySequential(
    allProducts: string[],
    productContragents: Map<string, Set<string>>,
    minCommonUsers: number,
    topN: number
  ): Map<string, Array<{ productId: string; score: number }>> {
    logger.info(
      '[CollaborativeFilter] Step 2: Computing item-item similarity using optimized Jaccard similarity'
    );

    // Pre-compute sorted arrays and sizes for efficiency
    const productData = new Map<string, { sorted: string[]; size: number }>();
    for (const productId of allProducts) {
      const contragents = Array.from(productContragents.get(productId)!);
      contragents.sort(); // Sort for merge-join
      productData.set(productId, { sorted: contragents, size: contragents.length });
    }

    const similarityMatrix = new Map<string, MinHeap<{ productId: string; score: number }>>();
    
    // Initialize heaps for all products
    for (const productId of allProducts) {
      similarityMatrix.set(productId, new MinHeap<{ productId: string; score: number }>(topN));
    }

    let processed = 0;
    const logInterval = Math.max(1, Math.floor(allProducts.length / 10));
    let totalComparisons = 0;
    let skippedComparisons = 0;

    // Compute upper triangle only (exploit symmetry)
    for (let i = 0; i < allProducts.length; i++) {
      const productA = allProducts[i];
      const dataA = productData.get(productA)!;
      const heapA = similarityMatrix.get(productA)!;

      for (let j = i + 1; j < allProducts.length; j++) {
        const productB = allProducts[j];
        const dataB = productData.get(productB)!;

        totalComparisons++;

        // Early termination: skip if either product has fewer than minCommonUsers
        if (dataA.size < minCommonUsers || dataB.size < minCommonUsers) {
          skippedComparisons++;
          continue;
        }

        // Early termination: if min size is less than threshold, impossible to meet
        const minSize = Math.min(dataA.size, dataB.size);
        if (minSize < minCommonUsers) {
          skippedComparisons++;
          continue;
        }

        // Optimized intersection using merge-join
        const { intersection, earlyExit } = optimizedIntersection(
          dataA.sorted,
          dataB.sorted,
          minCommonUsers
        );

        if (earlyExit) {
          skippedComparisons++;
          continue;
        }

        // Calculate Jaccard similarity: intersection / union
        // Union = |A| + |B| - intersection (optimized, no need to create union set)
        const union = dataA.size + dataB.size - intersection;
        const similarity = intersection / union;

        // Add to both products' heaps (symmetry)
        heapA.push({ productId: productB, score: similarity });
        const heapB = similarityMatrix.get(productB)!;
        heapB.push({ productId: productA, score: similarity });
      }

      processed++;
      if (processed % logInterval === 0 || processed === allProducts.length) {
        logger.info(
          `[CollaborativeFilter] Progress: ${processed}/${allProducts.length} products processed (${Math.round((processed / allProducts.length) * 100)}%)`
        );
      }
    }

    // Convert heaps to sorted arrays
    const result = new Map<string, Array<{ productId: string; score: number }>>();
    for (const [productId, heap] of similarityMatrix) {
      result.set(productId, heap.toSortedArray());
    }

    const totalSimilarities = Array.from(result.values()).reduce(
      (sum, sims) => sum + sims.length,
      0
    );

    logger.info(
      `[CollaborativeFilter] Computed similarity for ${allProducts.length} products: ${totalSimilarities} total similarities, ${totalComparisons} comparisons, ${skippedComparisons} skipped (${Math.round((skippedComparisons / totalComparisons) * 100)}% early termination)`
    );

    return result;
  }

  /**
   * Parallel computation using worker threads
   */
  private computeItemBasedSimilarityParallel(
    allProducts: string[],
    productContragents: Map<string, Set<string>>,
    minCommonUsers: number,
    topN: number
  ): Map<string, Array<{ productId: string; score: number }>> {
    // For now, fall back to sequential with a note about future implementation
    // Full parallel implementation would require worker thread setup
    logger.warn(
      '[CollaborativeFilter] Parallel processing requested but not fully implemented yet, using optimized sequential'
    );
    return this.computeItemBasedSimilaritySequential(allProducts, productContragents, minCommonUsers, topN);
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
        score: totalScore / purchasedProducts.size, // Normalize
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    logger.info(
      `[CollaborativeFilter] Generated ${recommendations.length} recommendations for contragent ${contragentId}`
    );

    return recommendations;
  }
}

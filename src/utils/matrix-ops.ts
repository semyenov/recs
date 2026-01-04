import { Matrix } from 'ml-matrix';
import { logger } from '../config/logger';

/**
 * Matrix operations utility for optimizing similarity calculations
 * Provides optimized matrix-based operations for collaborative filtering
 */

export interface InteractionMatrixData {
  productIds: string[];
  contragentIds: string[];
  matrix: Matrix;
  productIndexMap: Map<string, number>;
  contragentIndexMap: Map<string, number>;
}

/**
 * Convert product-contragent interaction Map to a binary matrix
 * Rows represent products, columns represent contragents
 * Value is 1 if product is in contragent's order, 0 otherwise
 */
export function buildInteractionMatrix(
  productContragents: Map<string, Set<string>>
): InteractionMatrixData {
  const allProducts = Array.from(productContragents.keys());
  const allContragents = new Set<string>();

  // Collect all unique contragents
  for (const contragents of productContragents.values()) {
    for (const contragentId of contragents) {
      allContragents.add(contragentId);
    }
  }

  const contragentArray = Array.from(allContragents);
  const numProducts = allProducts.length;
  const numContragents = contragentArray.length;

  // Create index maps for fast lookup
  const productIndexMap = new Map<string, number>();
  const contragentIndexMap = new Map<string, number>();

  allProducts.forEach((productId, index) => {
    productIndexMap.set(productId, index);
  });

  contragentArray.forEach((contragentId, index) => {
    contragentIndexMap.set(contragentId, index);
  });

  // Build binary matrix
  const matrixData: number[][] = [];
  for (let i = 0; i < numProducts; i++) {
    const row: number[] = new Array(numContragents).fill(0);
    const productId = allProducts[i];
    const contragents = productContragents.get(productId);

    if (contragents) {
      for (const contragentId of contragents) {
        const colIndex = contragentIndexMap.get(contragentId);
        if (colIndex !== undefined) {
          row[colIndex] = 1;
        }
      }
    }

    matrixData.push(row);
  }

  const matrix = new Matrix(matrixData);

  return {
    productIds: allProducts,
    contragentIds: contragentArray,
    matrix,
    productIndexMap,
    contragentIndexMap,
  };
}

/**
 * Compute Jaccard similarity matrix using matrix operations
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B| = intersection / (|A| + |B| - intersection)
 * 
 * Uses matrix multiplication: M * M^T gives intersection counts
 * Row sums give |A| and |B|
 */
export function computeJaccardSimilarityMatrix(
  interactionData: InteractionMatrixData,
  minCommonUsers: number = 0
): Matrix {
  const { matrix } = interactionData;
  const numProducts = matrix.rows;

  // Compute row sums (number of contragents per product)
  const rowSums = matrix.sum('row') as number[];

  // Compute intersection matrix: M * M^T
  // This gives the number of common contragents between each pair of products
  logger.info(`[MatrixOps] Computing intersection matrix (${numProducts}×${numProducts})...`);
  const intersectionStartTime = Date.now();
  const intersectionMatrix = matrix.mmul(matrix.transpose());
  const intersectionTime = Date.now() - intersectionStartTime;
  logger.info(`[MatrixOps] Intersection matrix computed (${intersectionTime}ms)`);

  // Compute Jaccard similarity matrix
  const similarityMatrix = new Matrix(numProducts, numProducts);
  const logInterval = Math.max(1, Math.floor(numProducts / 10));
  let processed = 0;

  logger.info(`[MatrixOps] Computing Jaccard similarities for ${numProducts} products...`);
  const similarityStartTime = Date.now();

  for (let i = 0; i < numProducts; i++) {
    const sizeA = rowSums[i];

    // Skip if product A has fewer than minCommonUsers
    if (sizeA < minCommonUsers) {
      processed++;
      continue;
    }

    for (let j = 0; j < numProducts; j++) {
      // Only compute upper triangle (exploit symmetry)
      if (j <= i) {
        continue;
      }

      const sizeB = rowSums[j];

      // Skip if product B has fewer than minCommonUsers
      if (sizeB < minCommonUsers) {
        continue;
      }

      // Early termination: if min size is less than threshold
      const minSize = Math.min(sizeA, sizeB);
      if (minSize < minCommonUsers) {
        continue;
      }

      // Get intersection count
      const intersection = intersectionMatrix.get(i, j);

      // Early exit if intersection is too small
      if (intersection < minCommonUsers) {
        continue;
      }

      // Calculate Jaccard similarity: intersection / union
      const union = sizeA + sizeB - intersection;
      const similarity = union > 0 ? intersection / union : 0;

      // Set both symmetric entries
      similarityMatrix.set(i, j, similarity);
      similarityMatrix.set(j, i, similarity);
    }

    processed++;
    if (processed % logInterval === 0 || processed === numProducts) {
      const elapsed = Date.now() - similarityStartTime;
      logger.info(
        `[MatrixOps] Progress: ${processed}/${numProducts} products processed (${Math.round((processed / numProducts) * 100)}%) - ${elapsed}ms elapsed`
      );
    }
  }

  const similarityTime = Date.now() - similarityStartTime;
  logger.info(`[MatrixOps] Jaccard similarity matrix computed (${similarityTime}ms)`);

  return similarityMatrix;
}

/**
 * Extract top-N similarities from similarity matrix
 * Returns Map of productId -> Array of {productId, score} sorted by score descending
 */
export function extractTopNSimilarities(
  similarityMatrix: Matrix,
  interactionData: InteractionMatrixData,
  topN: number
): Map<string, Array<{ productId: string; score: number }>> {
  const { productIds } = interactionData;
  const result = new Map<string, Array<{ productId: string; score: number }>>();

  for (let i = 0; i < similarityMatrix.rows; i++) {
    const productId = productIds[i];
    const similarities: Array<{ productId: string; score: number }> = [];

    // Extract all similarities for this product
    for (let j = 0; j < similarityMatrix.columns; j++) {
      if (i === j) continue; // Skip self-similarity

      const score = similarityMatrix.get(i, j);
      if (score > 0) {
        similarities.push({
          productId: productIds[j],
          score,
        });
      }
    }

    // Sort by score descending and take top N
    similarities.sort((a, b) => b.score - a.score);
    result.set(productId, similarities.slice(0, topN));
  }

  return result;
}

/**
 * Compute similarity matrix using optimized matrix operations
 * This is a convenience function that combines building the interaction matrix,
 * computing Jaccard similarity, and extracting top-N results
 */
export function computeSimilarityMatrixOptimized(
  productContragents: Map<string, Set<string>>,
  minCommonUsers: number,
  topN: number
): Map<string, Array<{ productId: string; score: number }>> {
  const startTime = Date.now();

  logger.info('[MatrixOps] Building interaction matrix from product-contragent data');
  const interactionData = buildInteractionMatrix(productContragents);

  const buildTime = Date.now() - startTime;
  logger.info(
    `[MatrixOps] Built interaction matrix: ${interactionData.productIds.length} products × ${interactionData.contragentIds.length} contragents (${buildTime}ms)`
  );

  logger.info('[MatrixOps] Computing Jaccard similarity matrix');
  const similarityStartTime = Date.now();
  const similarityMatrix = computeJaccardSimilarityMatrix(interactionData, minCommonUsers);
  const similarityTime = Date.now() - similarityStartTime;
  logger.info(`[MatrixOps] Computed similarity matrix (${similarityTime}ms)`);

  logger.info('[MatrixOps] Extracting top-N similarities');
  const extractStartTime = Date.now();
  const result = extractTopNSimilarities(similarityMatrix, interactionData, topN);
  const extractTime = Date.now() - extractStartTime;
  logger.info(`[MatrixOps] Extracted top-N similarities (${extractTime}ms)`);

  const totalTime = Date.now() - startTime;
  logger.info(`[MatrixOps] Total matrix-based computation: ${totalTime}ms`);

  return result;
}

/**
 * Check if matrix-based computation would be beneficial
 * For very sparse data, small datasets, or very large datasets, the optimized intersection approach may be faster
 */
export function shouldUseMatrixOperations(
  numProducts: number,
  numContragents: number,
  avgContragentsPerProduct: number
): boolean {
  // Matrix operations are beneficial for medium-sized datasets with reasonable density
  // For very large datasets (>5000 products), matrix multiplication becomes too expensive
  // For very small datasets (<1000 products), the overhead isn't worth it
  // For very sparse data, the optimized intersection is more efficient
  
  const sparsity = numContragents > 0 ? avgContragentsPerProduct / numContragents : 0;
  const isMediumSize = numProducts >= 1000 && numProducts <= 5000;
  const isNotExtremelySparse = sparsity > 0.01;
  const isNotTooDense = sparsity < 0.5; // Very dense data might also be slow

  // Only use matrix operations for medium-sized, moderately dense datasets
  return isMediumSize && isNotExtremelySparse && isNotTooDense;
}

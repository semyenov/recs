import Piscina from 'piscina';
import { Heap } from 'heap-js';

/**
 * Worker thread data structures
 */
export interface WorkerChunk {
  productIds: string[];
  productData: Record<string, { sorted: string[]; size: number }>;
  allProductIds: string[];
  minCommonUsers: number;
  topN: number;
  startIndex: number;
  endIndex: number;
}

export interface WorkerResult {
  productId: string;
  similarities: Array<{ productId: string; score: number }>;
}

/**
 * Wrapper around heap-js Heap for maintaining top-N items efficiently (same as main thread)
 */
class TopNHeap<T extends { score: number }> {
  private heap: Heap<T>;

  constructor(private maxSize: number) {
    // MinHeap with comparator: smaller score = higher priority (we want to keep largest scores)
    this.heap = new Heap<T>((a, b) => a.score - b.score);
  }

  push(item: T): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
    } else {
      // If heap is full, check if new item is better than the worst (root/min)
      const root = this.heap.peek();
      if (root && item.score > root.score) {
        this.heap.replace(item); // Replace root with new larger item
      }
    }
  }

  toSortedArray(): T[] {
    // Extract all items and sort descending by score
    const items: T[] = [];
    while (this.heap.length > 0) {
      items.push(this.heap.pop()!);
    }
    // Sort descending (largest scores first)
    return items.sort((a, b) => b.score - a.score);
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

/**
 * Worker function: Process a chunk of products and compute similarities
 * This runs in a worker thread, so it must be a pure function with serializable data
 */
export default function processChunk(chunk: WorkerChunk): WorkerResult[] {
  const { productIds, productData, allProductIds, minCommonUsers, topN, startIndex } = chunk;
  const results: WorkerResult[] = [];

  // Process each product in this chunk
  for (let i = 0; i < productIds.length; i++) {
    const productA = productIds[i];
    const dataA = productData[productA];
    if (!dataA) continue;

    const heap = new TopNHeap<{ productId: string; score: number }>(topN);

    // Compute similarities with all other products (upper triangle only)
    // For products in this chunk, only compare with products at higher indices
    const globalIndexA = startIndex + i;

    for (let j = globalIndexA + 1; j < allProductIds.length; j++) {
      const productB = allProductIds[j];
      const dataB = productData[productB];
      if (!dataB) continue;

      // Early termination: skip if either product has fewer than minCommonUsers
      if (dataA.size < minCommonUsers || dataB.size < minCommonUsers) {
        continue;
      }

      // Early termination: if min size is less than threshold, impossible to meet
      const minSize = Math.min(dataA.size, dataB.size);
      if (minSize < minCommonUsers) {
        continue;
      }

      // Optimized intersection using merge-join
      const { intersection, earlyExit } = optimizedIntersection(
        dataA.sorted,
        dataB.sorted,
        minCommonUsers
      );

      if (earlyExit) {
        continue;
      }

      // Calculate Jaccard similarity: intersection / union
      // Union = |A| + |B| - intersection
      const union = dataA.size + dataB.size - intersection;
      const similarity = intersection / union;

      // Add to heap (top-N)
      heap.push({ productId: productB, score: similarity });
    }

    // Convert heap to sorted array
    const similarities = heap.toSortedArray();
    results.push({
      productId: productA,
      similarities,
    });
  }

  return results;
}

// Export for Piscina
if (!Piscina.isWorkerThread) {
  // This file is being imported in the main thread
  // The worker function will be used by Piscina
}

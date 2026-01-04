import { AssociationRule } from '../types';
import { logger } from '../config/logger';

export class AssociationRuleMiner {
  /**
   * Mine association rules using simple co-occurrence (frequent itemsets)
   * Implements basic support-confidence framework
   *
   * @param coOccurrences - Map of productA -> Map of productB -> count of orders containing both
   * @param productFrequencies - Map of productId -> number of orders containing that product
   * @param totalOrders - Total number of orders
   * @param minSupport - Minimum support threshold (0-1)
   * @param minConfidence - Minimum confidence threshold (0-1)
   */
  mineRules(
    coOccurrences: Map<string, Map<string, number>>,
    productFrequencies: Map<string, number>,
    totalOrders: number,
    minSupport: number = 0.01,
    minConfidence: number = 0.3
  ): Map<string, AssociationRule[]> {
    logger.info(
      `[AssociationRuleMiner] Starting rule mining from ${coOccurrences.size} products, ${totalOrders} orders (minSupport: ${minSupport}, minConfidence: ${minConfidence})`
    );

    const rules = new Map<string, AssociationRule[]>();

    // Calculate product support (frequency) - number of orders containing each product
    logger.info('[AssociationRuleMiner] Step 1: Calculating product support (frequency)');
    const productSupport = new Map<string, number>();
    for (const [productId, orderCount] of productFrequencies) {
      productSupport.set(productId, orderCount / totalOrders);
    }

    logger.info(`[AssociationRuleMiner] Calculated support for ${productSupport.size} products`);

    // Generate rules
    logger.info('[AssociationRuleMiner] Step 2: Generating association rules');
    let processed = 0;
    const logInterval = Math.max(1, Math.floor(coOccurrences.size / 10)); // Log every 10%

    // Statistics for debugging
    let totalPairs = 0;
    let filteredBySupport = 0;
    let filteredByConfidence = 0;
    let passedFilters = 0;
    let maxSupport = 0;
    let maxConfidence = 0;

    for (const [productA, occurrences] of coOccurrences) {
      const rulesForA: AssociationRule[] = [];
      const supportA = productSupport.get(productA);

      // Skip if productA has no support (not in any orders)
      if (!supportA || supportA === 0) {
        processed++;
        continue;
      }

      for (const [productB, coOccurCount] of occurrences) {
        const supportB = productSupport.get(productB);

        // Skip if productB has no support
        if (!supportB || supportB === 0) {
          continue;
        }

        totalPairs++;

        // Calculate metrics
        // Support(A and B) = number of orders containing both A and B / total orders
        const support = coOccurCount / totalOrders;

        // Confidence(A -> B) = P(B|A) = P(A and B) / P(A) = support(A and B) / support(A)
        // = (coOccurCount / totalOrders) / (orderCountA / totalOrders)
        // = coOccurCount / orderCountA
        const orderCountA = productFrequencies.get(productA)!;
        const confidence = orderCountA > 0 ? coOccurCount / orderCountA : 0;

        // Track max values for debugging
        if (support > maxSupport) maxSupport = support;
        if (confidence > maxConfidence) maxConfidence = confidence;

        // Lift(A -> B) = P(B|A) / P(B) = confidence / support(B)
        // = (coOccurCount / orderCountA) / (orderCountB / totalOrders)
        // = (coOccurCount * totalOrders) / (orderCountA * orderCountB)
        const orderCountB = productFrequencies.get(productB)!;
        const expectedCoOccur = (orderCountA * orderCountB) / totalOrders;
        const lift = expectedCoOccur > 0 ? coOccurCount / expectedCoOccur : 0;

        // Filter by thresholds
        if (support >= minSupport && confidence >= minConfidence) {
          rulesForA.push({
            antecedent: productA,
            consequent: productB,
            support,
            confidence,
            lift,
          });
          passedFilters++;
        } else {
          if (support < minSupport) filteredBySupport++;
          if (confidence < minConfidence) filteredByConfidence++;
        }
      }

      // Sort by confidence descending
      rulesForA.sort((a, b) => b.confidence - a.confidence);
      rules.set(productA, rulesForA);
      processed++;

      if (processed % logInterval === 0 || processed === coOccurrences.size) {
        logger.info(
          `[AssociationRuleMiner] Progress: ${processed}/${coOccurrences.size} products processed (${Math.round((processed / coOccurrences.size) * 100)}%)`
        );
      }
    }

    const totalRules = Array.from(rules.values()).reduce((sum, r) => sum + r.length, 0);
    logger.info(
      `[AssociationRuleMiner] Mined ${totalRules} association rules for ${rules.size} products (avg ${rules.size > 0 ? (totalRules / rules.size).toFixed(1) : 0} rules per product)`
    );

    // Log filtering statistics
    logger.info(
      `[AssociationRuleMiner] Rule filtering stats: ${totalPairs} pairs evaluated, ${passedFilters} passed, ${filteredBySupport} filtered by support (< ${minSupport}), ${filteredByConfidence} filtered by confidence (< ${minConfidence}), maxSupport=${maxSupport.toFixed(6)}, maxConfidence=${maxConfidence.toFixed(6)}`
    );

    return rules;
  }

  /**
   * Get "frequently bought with" recommendations for a product
   */
  getFrequentlyBoughtWith(
    productId: string,
    rules: Map<string, AssociationRule[]>,
    topN: number
  ): Array<{ _id: string; score: number }> {
    logger.info(
      `[AssociationRuleMiner] Getting frequently bought with recommendations for product ${productId} (topN: ${topN})`
    );
    const productRules = rules.get(productId) || [];

    logger.info(
      `[AssociationRuleMiner] Found ${productRules.length} association rules for product ${productId}`
    );

    const recommendations = productRules.slice(0, topN).map((rule) => ({
      _id: rule.consequent,
      score: rule.confidence, // Use confidence as score
    }));

    logger.info(
      `[AssociationRuleMiner] Returning ${recommendations.length} frequently bought with recommendations for product ${productId}`
    );

    return recommendations;
  }
}

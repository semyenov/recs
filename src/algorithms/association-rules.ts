import { AssociationRule } from '../types';
import { logger } from '../config/logger';

export class AssociationRuleMiner {
  /**
   * Mine association rules using simple co-occurrence (frequent itemsets)
   * Implements basic support-confidence framework
   */
  mineRules(
    coOccurrences: Map<string, Map<string, number>>,
    totalOrders: number,
    minSupport: number = 0.01,
    minConfidence: number = 0.3
  ): Map<string, AssociationRule[]> {
    const rules = new Map<string, AssociationRule[]>();

    // Calculate product support (frequency)
    const productSupport = new Map<string, number>();
    for (const [productA, occurrences] of coOccurrences) {
      let totalOccurrences = 0;
      for (const count of occurrences.values()) {
        totalOccurrences += count;
      }
      productSupport.set(productA, totalOccurrences / totalOrders);
    }

    // Generate rules
    for (const [productA, occurrences] of coOccurrences) {
      const rulesForA: AssociationRule[] = [];

      for (const [productB, coOccurCount] of occurrences) {
        // Calculate metrics
        const support = coOccurCount / totalOrders;
        const confidence = coOccurCount / (productSupport.get(productA)! * totalOrders);
        const expectedCoOccur =
          productSupport.get(productA)! * productSupport.get(productB)! * totalOrders;
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
        }
      }

      // Sort by confidence descending
      rulesForA.sort((a, b) => b.confidence - a.confidence);
      rules.set(productA, rulesForA);
    }

    const totalRules = Array.from(rules.values()).reduce((sum, r) => sum + r.length, 0);
    logger.info(`Mined ${totalRules} association rules for ${rules.size} products`);

    return rules;
  }

  /**
   * Get "frequently bought with" recommendations for a product
   */
  getFrequentlyBoughtWith(
    productId: string,
    rules: Map<string, AssociationRule[]>,
    topN: number
  ): Array<{ productId: string; score: number }> {
    const productRules = rules.get(productId) || [];

    return productRules.slice(0, topN).map((rule) => ({
      productId: rule.consequent,
      score: rule.confidence, // Use confidence as score
    }));
  }
}

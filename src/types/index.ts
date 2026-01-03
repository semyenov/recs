// Product Types
export interface TechnicalProperties {
  size?: number;
  price?: number;
  weight?: number;
  category?: string;
  color?: string;
  material?: string;
  [key: string]: unknown;
}

export interface Product {
  _id: string;
  productId: string;
  name: string;
  category: string;
  technicalProperties: TechnicalProperties;
  createdAt: Date;
  updatedAt: Date;
}

// Order Types
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Order {
  _id: string;
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  orderDate: Date;
  createdAt: Date;
}

// Recommendation Types
export interface RecommendationScore {
  productId: string;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  contentBased?: number;
  collaborative?: number;
  association?: number;
  blendedScore: number;
  weights: {
    contentBased: number;
    collaborative: number;
    association: number;
  };
}

export interface Recommendation {
  _id?: string;
  productId: string;
  algorithmType: 'content-based' | 'collaborative' | 'association' | 'hybrid';
  recommendations: RecommendationScore[];
  version: string;
  batchId: string;
  createdAt: Date;
  metadata?: {
    computeTime?: number;
    totalCandidates?: number;
    filterReason?: string;
  };
}

// Feature Vector Types
export interface FeatureVector {
  productId: string;
  features: number[];
  presenceIndicators: number[];
  normalized: boolean;
}

export interface CategoryStats {
  category: string;
  medians: {
    [key: string]: number;
  };
  counts: {
    total: number;
    [key: string]: number;
  };
  lastUpdated: Date;
}

// Collaborative Filtering Types
export interface ProductSimilarity {
  productA: string;
  productB: string;
  similarity: number;
  commonUsers: number;
}

export interface UserProductInteraction {
  userId: string;
  productId: string;
  interactionCount: number;
  lastInteraction: Date;
}

// Association Rules Types
export interface AssociationRule {
  antecedent: string;
  consequent: string;
  support: number;
  confidence: number;
  lift: number;
}

// API Response Types
export interface RecommendationResponse {
  productId: string;
  recommendations: Array<{
    productId: string;
    score: number;
    rank: number;
  }>;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  metadata?: {
    version: string;
    cacheHit: boolean;
    computeTime: number;
  };
}

export interface DebugRecommendationResponse extends RecommendationResponse {
  debug: {
    scoreBreakdown: ScoreBreakdown[];
    batchId: string;
    version: string;
    cacheHit: boolean;
  };
}

// API Key Types
export interface ApiKey {
  key: string;
  userId?: string;
  isAdmin: boolean;
  rateLimit?: number;
  createdAt: Date;
}

// Version Management Types
export interface RecommendationVersion {
  version: string;
  timestamp: number;
  status: 'active' | 'previous' | 'archived';
  metrics: {
    avgScore: number;
    coverage: number;
    diversityScore: number;
  };
}

// Quality Metrics Types
export interface QualityMetrics {
  avgScore: number;
  coverage: number;
  diversityScore: number;
  precision_at_10?: number;
  recall_at_10?: number;
}

// Ground Truth Types
export interface GroundTruth {
  userId: string;
  productId: string;
  isPositive: boolean;
  signals: {
    clicked?: Date;
    purchased?: Date;
    rated?: number;
    addedToCart?: Date;
  };
}

// Batch Job Types
export interface BatchJobConfig {
  jobName: string;
  batchSize: number;
  topN: number;
  minScore: number;
  diversityThreshold: number;
}

export interface BatchJobResult {
  jobId: string;
  batchId: string;
  version: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  productsProcessed: number;
  recommendationsGenerated: number;
  success: boolean;
  error?: string;
}

// Product Types
// Product attribute structure from actual data
export interface ProductAttribute {
  name: string;
  value: string | number | boolean;
}

export interface ProductAttributes {
  [key: string]: ProductAttribute;
}

export interface ProductPrices {
  [storeId: string]: number;
}

export interface ProductImages {
  [key: string]: string;
}

export interface ProductStocks {
  [storeId: string]: number;
}

export interface ProductDeliveryDays {
  [storeId: string]: [number, number];
}

// Extended Product interface matching actual data structure
export interface Product {
  _id: string;
  name?: string;
  fullName?: string;
  yandexName?: string;
  brand?: string;
  model?: string;
  code?: string;
  category: string;
  categoryId?: string;
  categoryName?: string;
  categories?: string[];
  family?: string;
  description?: string;
  attributes?: ProductAttributes;
  images?: ProductImages;
  prices?: ProductPrices;
  oldPrices?: {
    prices: ProductPrices;
    date: Date;
  };
  stocks?: ProductStocks;
  stocksSummary?: string;
  DeliveryDays?: ProductDeliveryDays;
  DeliveryMinMax?: {
    min: number;
    max: number;
  };
  enabled?: boolean;
  box?: number;
  collections?: string[];
  hash?: string;
  updated?: string | Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Order Types
export interface ProductInOrder {
  name: string;
  price: number;
  quantity: number;
  status: string;
}

export interface Order {
  _id: string;
  number?: string;
  name?: string;
  contragent?: string;
  contragentId: string;
  manager?: string;
  managerId?: string;
  products: { [productId: string]: ProductInOrder };
  summary: number;
  date?: Date | { $date: string };
  createdDate?: Date | { $date: string };
  saleDate?: Date | { $date: string };
  status?: string;
  posted?: boolean;
  deleted?: boolean;
  enabled?: boolean;
  size?: number;
  timestamp?: number;
  ref?: string;
  dataVersion?: string;
  createdAt?: Date;
  __v?: number;
}

// Recommendation Types
export interface RecommendationScore {
  _id: string;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  collaborative?: number;
  association?: number;
  blendedScore: number;
  weights: {
    collaborative: number;
    association: number;
  };
}

export interface Recommendation {
  _id?: string;
  productId: string; // This is the _id of the product for which recommendations are generated (kept for backward compatibility with existing data)
  algorithmType: 'collaborative' | 'association' | 'hybrid';
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
  _id: string;
  features: number[];
  presenceIndicators: number[];
  normalized: boolean;
}

export interface CategoryStats {
  category: string;
  medians: {
    [attributeKey: string]: number;
  };
  counts: {
    total: number;
    [attributeKey: string]: number;
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

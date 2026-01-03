---
title: 'Product Recommendation Service'
slug: 'product-recommendation-service'
created: '2026-01-03'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript 5.x', 'Node.js 20+', 'Express.js', 'MongoDB', 'Redis', 'BullMQ', 'Jest', 'ioredis', 'ml-distance', 'mathjs', 'Zod', 'Winston', 'Prometheus']
files_to_modify: []
code_patterns: ['Clean slate project', 'Layered architecture (API/Engine/Storage/Jobs)', 'TypeScript strict mode', 'Dependency injection ready', 'Circuit breaker pattern', 'Graceful degradation']
test_patterns: ['Jest for unit/integration tests', 'Supertest for API tests', 'Separate test directories (unit/integration/e2e)', 'Test coverage targets']
---

# Tech-Spec: Product Recommendation Service

**Created:** 2026-01-03

## Overview

### Problem Statement

Need a scalable recommendation engine that provides multiple types of product suggestions (similar products based on attributes, frequently bought together, and collaborative filtering recommendations) from user order history stored in MongoDB.

### Solution

Build a TypeScript REST API service with a **tiered pre-computation strategy** that optimizes for data velocity:

**Architecture Layers:**
```
┌─────────────────────────────────────────────┐
│ API Layer (REST)                             │
├─────────────────────────────────────────────┤
│ Recommendation Engine (Business Logic)       │
│ - Score blending & fallback chains          │
│ - Cold start handling                        │
├─────────────────────────────────────────────┤
│ Storage Layer (Tiered)                       │
│ - MongoDB: Orders, Products (source data)   │
│ - Redis: Hot recommendations (fast lookup)   │
│ - MongoDB: Cold recommendations (archived)   │
├─────────────────────────────────────────────┤
│ Computation Layer (Background Jobs)          │
│ - Content-based: Catalog change triggers    │
│ - Collaborative: Hourly batch processing     │
│ - Association rules: Daily batch processing  │
└─────────────────────────────────────────────┘
```

**Algorithm Strategy:**
- **Content-based filtering**: Cosine similarity on normalized technical property vectors (scored 8.2/10 in comparative analysis)
- **Collaborative filtering**: Item-based CF (scored 7.3/10 - best for pre-computation stability)
- **Association rules**: Simple co-occurrence for MVP, upgradeable to FP-Growth (scored 8.1/10)
- **Score blending**: Feature-weighted linear combination with context-aware weights

**Pre-computation Strategy:**
- **Trigger-based**: Content similarity recomputes on catalog changes (rare)
- **Scheduled batches**: Association rules (daily), collaborative filtering (hourly)
- **Lazy computation**: First request for new entities computes then caches
- **Tiered storage**: Hot recommendations in Redis, cold in MongoDB

### Scope

**In Scope:**
- REST API endpoints for fetching recommendations:
  - `GET /v1/products/{productId}/similar?limit=20&offset=0` - Attribute-based recommendations
  - `GET /v1/products/{productId}/frequently-bought-with?limit=20&offset=0` - Association rule recommendations
  - `GET /v1/users/{userId}/recommended?limit=20&offset=0` - Personalized collaborative filtering
  - `GET /v1/products/{productId}/recommendations?userId={userId}&limit=20&offset=0` - Hybrid context-aware
  - `GET /debug/v1/recommendations/:productId?explain=true` - Debug endpoint (admin API key required)
  - Query parameters: `limit` (default: 20, max: 100), `offset` (default: 0) for pagination
  - Response includes pagination metadata (total, hasMore)
- MongoDB integration for source data (user orders and products)
- Redis caching layer for hot recommendations (fast retrieval)
- Pre-computation engine with tiered strategies:
  - Similar products: Trigger-based (on catalog change)
  - Frequently bought together: Daily batch processing
  - Collaborative filtering: Hourly batch processing
- Background job scheduler (BullMQ) for batch computations
- **Resilience & Reliability**:
  - Graceful degradation (Redis → MongoDB fallback)
  - Circuit breaker pattern for external dependencies
  - Request timeouts (5s max)
  - Health check endpoints
- **Quality Assurance**:
  - Data validation (min orders threshold, score confidence thresholds)
  - Offline evaluation metrics (Precision@K, Recall@K)
  - Diversity constraints (prevent all-same-category recommendations)
- **Observability**:
  - Recommendation provenance logging (score breakdowns, batch IDs)
  - Job duration monitoring and alerting
  - Per-product recommendation freshness tracking
- **Cache Management**:
  - Versioned cache keys for atomic updates
  - Version history: Keep last 3 versions (current, previous, archived) for rollback capability
  - TTL-based expiration (2-hour safety net)
  - Atomic switchover between batch versions
  - Quality gates before promotion (avg score >0.4, coverage >70%, diversity >60%)
  - Manual rollback command available for bad deployments
- **Scalability Safeguards**:
  - Incremental updates (only changed products)
  - Pagination/batching for large datasets
  - Horizontal scaling support for workers
  - ANN fallback for catalogs >1M products
  - Hot product detection and adaptive caching
  - Transactional batch execution with rollback capability
- Cold start handling (fallback chains, new product boost, explore/exploit)
- Score blending logic for hybrid recommendations
- Similarity calculation using product technical properties (cosine similarity)

**Out of Scope:**
- Real-time on-demand recommendation computation (all use pre-computed data)
- User authentication/authorization (assume handled by API gateway)
- Product catalog management CRUD operations
- Order management system (reads existing orders only)
- Admin dashboard/UI for monitoring
- Machine learning model training infrastructure (using algorithmic approaches)
- A/B testing framework
- Recommendation explanation/interpretability features
- Multi-tenancy support

## Context for Development

### Technical Preferences

- **Language**: TypeScript (Node.js runtime)
- **Primary Database**: MongoDB (source data: orders, products, cold recommendations)
- **Cache Layer**: Redis (hot recommendations for fast retrieval)
- **API Style**: REST with JSON responses
- **Recommendation Strategy**: Tiered pre-computation based on data velocity
- **Algorithms**: 
  - Content-based: Cosine similarity on normalized feature vectors (8.2/10 vs Manhattan 7.4/10)
    - For catalogs >1M products: Approximate Nearest Neighbors (Annoy/hnswlib)
  - Collaborative: Item-based collaborative filtering (7.3/10 vs User-based 3.8/10)
    - Adaptive thresholds based on data availability
  - Association rules: Simple co-occurrence for MVP (8.1/10), FP-Growth for advanced patterns (8.0/10)
    - Weighted by order size to prevent bulk purchase skew
  - Score blending: Feature-weighted linear (`w_content * contentScore + w_collab * collabScore + w_assoc * assocScore`)
- **Job Scheduler**: BullMQ (Redis-based, 8.6/10 - reliable, observable, scales well)
- **Data Quality**: Robust feature extraction with missing value handling (median imputation, presence indicators)
- **Performance Target**: API responses < 100ms (Redis-backed), < 500ms (MongoDB fallback)
- **Reliability Target**: 99.9% uptime with graceful degradation
- **Staleness Tolerance**: 
  - Content-based: Acceptable until catalog changes
  - Collaborative: Up to 1 hour stale
  - Association rules: Up to 24 hours stale
- **Quality Thresholds**:
  - Minimum confidence score: 0.3 (recommendations below this not served)
  - Minimum orders per product for CF: 10 orders (adaptive: lowers to 3 if sparse data)
  - Minimum batch job success rate: 95%
  - Maximum batch job duration: 50 minutes (before hourly overlap)
  - Maximum order size for association rules: 20 products (larger orders sampled/weighted)
  - Data quality minimum: <50% missing critical attributes
- **Scale Thresholds**:
  - Exact similarity: Up to 1M products
  - ANN (Approximate): >1M products
  - Hot product threshold: 1000 req/min triggers extended caching
- **BullMQ Worker Scaling**:
  - Content-based: 1-5 workers (scale at 100 jobs queued)
  - Collaborative: 2-10 workers (scale at 50 jobs queued)
  - Association: 1-4 workers (scale at 75 jobs queued)
  - Auto-scaling based on queue depth monitoring
- **Adaptive Threshold Formula** (Formal Specification):
  ```typescript
  function calculateMinOrderThreshold(products: Product[]): number {
    const avgOrders = mean(products.map(p => p.orderCount));
    
    if (avgOrders >= 10) {
      return 10; // Standard threshold
    } else {
      // Scale down proportionally with floor of 3
      return Math.max(3, Math.floor(avgOrders * 0.5));
    }
  }
  ```
- **Cache Warming Strategy**:
  - Proactive warming: Top 100 hot products immediately after version promotion
  - Hot product TTL: 4 hours (extended from standard 2 hours)
  - Lazy warming: All other products cached on first request
  - Benefits: Predictable performance for high-traffic products, efficient memory usage
- **Backup & Disaster Recovery**:
  - **Critical Data** (orders, products): Daily snapshots + transaction logs, RPO: 1 hour, RTO: 30 minutes
  - **Derived Data** (recommendations): No backup (recomputable from critical data), RPO: 0, RTO: 2 hours
  - **Redis Cache**: No backup (ephemeral), RTO: 0 (lazy warming)
  - **Retention**: 7 daily snapshots, 4 weekly snapshots, 3 monthly snapshots
- **Redis Memory Configuration**:
  - Instance size: 2GB minimum
  - Eviction policy: `allkeys-lru` (evict least recently used keys)
  - Persistence: Disabled (cache-only mode for performance)
  - Memory thresholds: Warning at 70% (1.4GB), Critical at 85% (1.7GB)
  - Estimated usage: 200MB per 100K products (with 50% safety buffer = 900MB for 300K products)
- **Environment Variables** (see Dependencies section for complete specification with Zod validation):
  - **Critical** (6): MONGODB_URI, REDIS_URL, PORT, NODE_ENV, API_KEY_SALT, WEBHOOK_SECRET
  - **Optional** (13): Performance tuning, rate limiting, logging, monitoring, algorithm parameters
  - Validation: Fail fast on startup with clear error messages

### Codebase Patterns

**Project Status**: Clean slate - no existing codebase.

**Architectural Pattern**: Layered architecture with clear separation of concerns:
- **API Layer** (`src/api/`): Express routes, request validation, response formatting
- **Engine Layer** (`src/engine/`): Business logic, score blending, fallback chains
- **Algorithm Layer** (`src/algorithms/`): Content-based, collaborative filtering, association rules
- **Storage Layer** (`src/storage/`): MongoDB and Redis clients with connection pooling
- **Job Layer** (`src/jobs/`): BullMQ workers for batch processing
- **Models Layer** (`src/models/`): TypeScript interfaces and types
- **Utils Layer** (`src/utils/`): Shared utilities, logging, metrics, validation

**Code Standards**:
- TypeScript strict mode enabled
- ESLint + Prettier for code formatting
- Functional programming style where appropriate
- Dependency injection for testability
- Circuit breaker pattern for external dependencies
- Structured logging (Winston) with correlation IDs
- Prometheus metrics for monitoring

**Naming Conventions**:
- Files: kebab-case (e.g., `cosine-similarity.ts`)
- Classes: PascalCase (e.g., `RecommendationEngine`)
- Functions: camelCase (e.g., `getRecommendations`)
- Constants: UPPER_SNAKE_CASE (e.g., `HOT_PRODUCT_THRESHOLD`)
- Interfaces: PascalCase with `I` prefix optional (e.g., `Recommendation` or `IRecommendation`)

### Files to Reference

**No existing files** - Clean slate project.

**Files to Create** (from implementation plan):

| File Path | Purpose |
| --------- | ------- |
| `package.json` | Project dependencies and scripts |
| `tsconfig.json` | TypeScript configuration (strict mode) |
| `src/server.ts` | Main application entry point |
| `src/api/routes/recommendations.ts` | REST API endpoints |
| `src/engine/recommendation-engine.ts` | Core recommendation logic |
| `src/algorithms/content-based.ts` | Cosine similarity implementation |
| `src/algorithms/collaborative-filtering.ts` | Item-based CF |
| `src/algorithms/association-rules.ts` | Co-occurrence mining |
| `src/storage/mongodb-client.ts` | MongoDB connection and queries |
| `src/storage/redis-client.ts` | Redis connection and caching |
| `src/jobs/batch-processor.ts` | BullMQ job definitions |
| `src/models/recommendation.ts` | TypeScript types |
| `tests/unit/algorithms/*.test.ts` | Algorithm unit tests |
| `tests/integration/api/*.test.ts` | API integration tests |

### Architecture Decision Records

#### ADR-001: Tiered Storage Architecture (MongoDB + Redis)

**Context:** Need to serve recommendations with <100ms latency while storing large volumes of pre-computed data.

**Decision:** Use MongoDB for source data and cold storage + Redis for hot recommendation cache.

**Alternatives Considered:**
- MongoDB only: Simpler but slower (50-200ms queries)
- Redis only: Fast but memory-expensive and persistence concerns
- PostgreSQL + Redis: Strong consistency but overkill for document data

**Trade-offs:**
- ✅ **Wins**: Sub-100ms responses, cost-effective (hot/cold tiering), scales independently
- ⚠️ **Costs**: Cache invalidation complexity, two systems to monitor, eventual consistency

**Rationale:** Industry-standard pattern for recommendation systems. MongoDB handles bulk storage, Redis provides fast read path.

---

#### ADR-002: Item-Based Collaborative Filtering

**Context:** Need collaborative filtering that works with pre-computation and scales with users.

**Decision:** Use item-based collaborative filtering (not user-based).

**Comparative Analysis Score:** 7.3/10 (weighted across feasibility, scalability, accuracy, cold start, cost, explainability)

**Alternatives Considered:**
- User-based CF: 3.8/10 - More intuitive but user count grows unbounded, less stable
- Matrix Factorization (SVD): 6.4/10 - Very accurate but computationally expensive
- Neural CF: 5.5/10 - State-of-art but requires ML infrastructure (out of scope)
- Slope One: 6.3/10 - Simple but lower accuracy

**Trade-offs:**
- ✅ **Wins**: Stable pre-computation (items change less than users), scales with product catalog (controlled growth), easier to debug
- ⚠️ **Costs**: Slightly less personalized than user-based, cold start worse for new products

**Rationale:** Product catalogs grow slower than user bases, making item-item matrices more manageable and stable. Best balance for batch pre-computation.

---

#### ADR-003: Multiple Pre-Computation Schedules

**Context:** Different recommendation types have different data velocity and freshness requirements.

**Decision:** Use tiered schedules: content-based (on catalog change), collaborative (hourly), association rules (daily).

**Alternatives Considered:**
- Real-time computation: Always fresh but high latency (>500ms) and expensive
- Single daily batch: Simple but collaborative recs too stale (24hr)
- Event-driven per order: Ultra fresh but expensive at scale

**Trade-offs:**
- ✅ **Wins**: Optimal freshness per type, compute cost optimized, better UX
- ⚠️ **Costs**: Orchestration complexity (3 schedules), monitoring overhead

**Rationale:** Data velocity differs dramatically—one-size-fits-all wastes compute or sacrifices freshness.

---

#### ADR-004: Cosine Similarity for Content-Based Filtering

**Context:** Need to measure product similarity based on technical properties (size, type, numeric features).

**Decision:** Use cosine similarity on normalized feature vectors.

**Comparative Analysis Score:** 8.2/10 (weighted across accuracy, efficiency, scalability, interpretability, robustness)

**Alternatives Considered:**
- Euclidean distance: 6.8/10 - Intuitive but sensitive to magnitude, curse of dimensionality
- Jaccard similarity: 6.9/10 - Great for categorical sets but ignores numeric features
- Pearson correlation: 6.7/10 - Good but computationally slower
- Manhattan distance: 7.4/10 - Robust but still magnitude-dependent

**Trade-offs:**
- ✅ **Wins**: Magnitude-independent, works well in high dimensions, proven for product similarity, computationally efficient
- ⚠️ **Costs**: Requires feature normalization step, less interpretable to non-technical stakeholders

**Rationale:** Industry standard for content-based recommendation with mixed feature types. Focuses on feature patterns rather than absolute values. Best score in comparative analysis.

---

#### ADR-005: REST API Protocol

**Context:** Need API to serve pre-computed recommendations to clients.

**Decision:** Use REST with well-defined resource endpoints per recommendation type.

**Alternatives Considered:**
- GraphQL: Flexible but overkill for simple retrieval, caching complex
- gRPC: High performance but binary protocol, limited browser support
- WebSocket: Real-time push not needed for pre-computed data

**Trade-offs:**
- ✅ **Wins**: Simple implementation, HTTP caching works, widely supported, matches access patterns
- ⚠️ **Costs**: Potential over-fetching, multiple endpoints to maintain

**Rationale:** REST is pragmatic for read-heavy service with simple access patterns (get recommendations by ID).

---

#### ADR-006: Association Rule Algorithm Selection

**Context:** Need to find frequently bought together patterns from order transaction data.

**Decision:** Start with simple co-occurrence counting for MVP, upgrade to FP-Growth if advanced patterns needed.

**Comparative Analysis Scores:**
- Simple co-occurrence: 8.1/10 (best for implementation ease + scalability)
- FP-Growth: 8.0/10 (best for advanced pattern mining)
- Apriori: 6.3/10 (multiple passes, slower)
- Eclat: 7.4/10 (good balance but less common)

**Alternatives Considered:**
- Apriori: Classic but requires multiple database passes, slower
- FP-Growth: More efficient for large datasets with complex patterns (3+ item sets)
- Eclat: Depth-first approach, good but less documentation/libraries

**Trade-offs:**
- ✅ **Wins** (Simple co-occurrence): Easy to implement, debug, and explain; extremely fast; sufficient for most use cases
- ⚠️ **Costs**: Limited to pairwise associations, no confidence/support thresholds, less sophisticated

**Migration Path:** Start simple, measure if you need more. If you need 3+ item patterns or confidence filtering, upgrade to FP-Growth.

**Rationale:** YAGNI principle - simple co-occurrence handles 80% of "frequently bought together" use cases. Can upgrade later without architectural changes.

---

#### ADR-007: Score Blending Strategy for Hybrid Recommendations

**Context:** Need to combine content-based, collaborative, and association scores into unified recommendations.

**Decision:** Use feature-weighted linear blending with context-aware weight adjustment.

**Comparative Analysis Score:** 8.4/10 (best balance of personalization, flexibility, cold start, cost, explainability)

**Alternatives Considered:**
- Weighted linear blend: 8.0/10 - Similar but static weights
- Multiplicative blend: 7.0/10 - High personalization but zeros kill entire score
- Switching strategy: 7.2/10 - Simple but less smooth
- Stacking (meta-learner): 7.1/10 - Most accurate but computationally expensive, not explainable

**Implementation Formula:**
```typescript
finalScore = w_content * contentScore 
           + w_collab * collabScore 
           + w_assoc * assocScore

// Context-aware weight adjustment:
// New user: w_content=0.7, w_collab=0.1, w_assoc=0.2
// Established user: w_content=0.2, w_collab=0.5, w_assoc=0.3
// New product: w_content=0.9, w_collab=0.05, w_assoc=0.05
```

**Trade-offs:**
- ✅ **Wins**: Flexible, explainable, handles cold start gracefully, simple to tune and debug
- ⚠️ **Costs**: Requires manual weight tuning, may not be optimal without A/B testing

**Rationale:** Most flexible approach that adapts to context (new users/products). Scores remain interpretable. Can be tuned based on business metrics.

---

#### ADR-008: Background Job Scheduler Selection

**Context:** Need reliable job scheduling for pre-computation batches (hourly collaborative, daily association rules, trigger-based content).

**Decision:** Use BullMQ (Redis-based job queue) for job orchestration.

**Comparative Analysis Score:** 8.6/10 (tied with AWS EventBridge at 8.7/10)

**Alternatives Considered:**
- Node-cron: 6.4/10 - Simple but no persistence, poor observability
- Agenda (MongoDB): 7.3/10 - Good but less mature than BullMQ
- AWS EventBridge: 8.7/10 - Excellent if on AWS, vendor lock-in
- Kubernetes CronJobs: 8.0/10 - Great if on K8s, infrastructure-heavy

**Trade-offs:**
- ✅ **Wins**: Reliable (Redis persistence), excellent monitoring, retries/backoff, priority queues, infrastructure-agnostic
- ⚠️ **Costs**: Adds Redis dependency (already have for caching), requires separate worker processes

**Rationale:** Already using Redis for caching, so no new infrastructure. BullMQ is battle-tested, well-documented, and provides excellent observability. Infrastructure-agnostic (works anywhere).

---

#### ADR-009: MongoDB Schema Design for Orders & Products

**Context:** Need to store orders and products in MongoDB with efficient query patterns for recommendation algorithms. Must support collaborative filtering, content-based, and association rule queries.

**Decision:** Use optimized schema with strategic indexes for performance.

**Schema Design:**

**Products Collection:**
```typescript
{
  _id: ObjectId,
  productId: string,              // indexed, unique
  name: string,
  category: string,               // indexed
  technicalProperties: {
    size?: number,
    type?: string,
    weight?: number,
    // ... other attributes
  },
  featureVector: number[],        // normalized for cosine similarity
  metadata: {
    createdAt: Date,              // indexed for "new product" detection
    lastModified: Date
  }
}

// Indexes:
// 1. { productId: 1 } - unique
// 2. { category: 1 } - for category median calculations
// 3. { "metadata.createdAt": -1 } - for new product boost
```

**Orders Collection:**
```typescript
{
  _id: ObjectId,
  orderId: string,                // indexed, unique
  userId: string,                 // indexed
  productIds: string[],           // array of product IDs
  timestamp: Date,                // indexed
  metadata: {
    orderSize: number,            // cached for weight calculation
    processed: boolean            // flag for batch job tracking
  }
}

// Indexes:
// 1. { orderId: 1 } - unique
// 2. { userId: 1, timestamp: -1 } - user order history
// 3. { productIds: 1 } - multi-key index for product lookups
// 4. { timestamp: -1, "metadata.processed": 1 } - batch job queries
```

**Recommendations Collection:**
```typescript
{
  _id: ObjectId,
  productId: string,              // indexed
  type: 'content' | 'collaborative' | 'association',
  recommendations: [
    {
      recommendedProductId: string,
      score: number,
      breakdown: {
        contentScore?: number,
        collabScore?: number,
        assocScore?: number,
        weights?: [number, number, number]
      },
      reason: string
    }
  ],
  batchId: string,
  timestamp: Date,
  version: string
}

// Indexes:
// 1. { productId: 1, type: 1 } - compound for fast lookups
// 2. { batchId: 1 } - for batch tracking
// 3. { timestamp: -1 } - for cleanup jobs
```

**Alternatives Considered:**
- Denormalized recommendations in Products: Faster reads but huge documents
- Separate collections per type: More modular but 3x collections
- PostgreSQL: Strong consistency but overkill for document data

**Trade-offs:**
- ✅ **Wins**: Multi-key index enables efficient CF queries, category index supports medians, separate recommendations collection keeps products lean
- ⚠️ **Costs**: Multi-key indexes consume more space, need to manage index growth

**Rationale:** Schema optimizes for most frequent queries (get recommendations, aggregate order pairs) while keeping documents manageable. Multi-key index on productIds is critical for collaborative filtering.

---

#### ADR-010: API Versioning Strategy

**Context:** REST API needs versioning to support non-breaking changes over time without breaking clients.

**Decision:** Use URL path versioning with `/v1/` prefix.

**API Structure:**
```
/v1/products/{productId}/similar
/v1/products/{productId}/frequently-bought-with
/v1/users/{userId}/recommended
/v1/products/{productId}/recommendations?userId={userId}
/v1/health
/v1/metrics

/debug/v1/recommendations/{productId}
```

**Version Support Policy:**
- Current version: Fully supported
- Previous version: 12 months support, security fixes only
- Deprecated: 6-month sunset notice

**Breaking vs Non-Breaking:**
- **Breaking** (new version required): Remove fields, change types, change status codes
- **Non-breaking** (same version): Add optional fields, new endpoints

**Alternatives Considered:**
- Header-based: More RESTful but harder for browser testing
- Query parameter: Simple but pollutes params
- No versioning: Impossible to evolve without breaking clients

**Trade-offs:**
- ✅ **Wins**: Explicit in URLs, visible in logs, easy to test, widely understood
- ⚠️ **Costs**: Verbose URLs, parallel implementations during transitions

**Rationale:** URL path versioning is pragmatic and industry-standard. Explicit, discoverable, supported by all clients.

---

#### ADR-011: Rate Limiting Strategy

**Context:** Public API needs DoS protection. Expected traffic: ~1000 req/s. Need to prevent abuse without impacting normal users.

**Decision:** Implement three-tier rate limiting with sliding window algorithm.

**Tiers:**
- **Global**: 10,000 req/s service-wide (returns 503)
- **Per-IP**: 100 req/min per IP (returns 429 with Retry-After)
- **Per-User** (future): 1000 req/hour per userId

**Implementation:**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const ipLimiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 1000,              // 1 minute
  max: 100,
  standardHeaders: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1704326400
Retry-After: 30
```

**Alternatives Considered:**
- Fixed window: Simpler but burst at boundaries
- Token bucket: More sophisticated but complex
- No rate limiting: Vulnerable to DoS
- API Gateway: Offload but adds dependency

**Trade-offs:**
- ✅ **Wins**: Sliding window prevents burst abuse, Redis-backed persists across restarts, standard headers
- ⚠️ **Costs**: Redis dependency, adds 2-5ms latency, needs monitoring

**Rationale:** Sliding window with Redis is industry standard. Per-IP limiting essential from day one.

---

#### ADR-012: Catalog Change Detection Mechanism

**Context:** Content-based similarity needs to recompute when product catalog changes. Need reliable trigger that scales.

**Decision:** Event-driven architecture with webhook + polling fallback.

**Flow:**
```
Product Update → Webhook → BullMQ Queue → Content-Based Job → Recompute
```

**Implementation:**
```typescript
// Webhook endpoint
app.post('/v1/webhooks/catalog-change', async (req, res) => {
  const { productIds, changeType } = req.body;
  
  if (!validateWebhookSignature(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  await catalogQueue.add('catalog-change', {
    productIds,
    changeType, // 'created' | 'updated' | 'deleted'
    timestamp: Date.now()
  });
  
  res.status(202).json({ message: 'Catalog change queued' });
});
```

**Webhook Contract:**
```
POST /v1/webhooks/catalog-change
Headers: X-Webhook-Signature: <HMAC-SHA256>
Body: { productIds: string[], changeType: string, timestamp: number }
```

**Fallback:** Poll `products.metadata.lastModified` every 15 minutes for changes since last poll.

**Alternatives Considered:**
- MongoDB change streams: Tightly coupled, requires MongoDB 3.6+
- Polling only: Wasteful, higher latency
- Manual API call: Error-prone, not scalable
- Kafka: Robust but adds infrastructure complexity

**Trade-offs:**
- ✅ **Wins**: Webhook is immediate, BullMQ reused, polling fallback ensures reliability
- ⚠️ **Costs**: Requires external integration, signature validation complexity

**Rationale:** Event-driven is modern approach. BullMQ already in stack. Polling fallback provides resilience.

---

#### ADR-013: Authentication & Authorization for User Endpoints

**Context:** `/users/{userId}/recommended` endpoint has security hole - user A can request user B's data. Need minimal auth without full OAuth infrastructure.

**Decision:** Implement API Key authentication with userId validation as interim solution.

**Approach:**
```typescript
async function validateUserAccess(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const requestedUserId = req.params.userId;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const keyData = await getApiKeyData(apiKey);
  
  if (!keyData) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Check ownership
  if (keyData.userId !== requestedUserId && !keyData.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  req.apiKeyData = keyData;
  next();
}
```

**API Key Structure:**
```typescript
{
  apiKey: string,       // "rec_live_abc123..."
  userId: string,
  isAdmin: boolean,
  rateLimit: number,
  expiresAt?: Date
}
```

**Endpoint Auth Requirements:**
- `/v1/products/*` - No auth (public)
- `/v1/users/{userId}/recommended` - API key required, userId validated
- `/v1/products/{id}/recommendations?userId={id}` - Optional API key (personalization)

**Alternatives Considered:**
- No auth: Dangerous, opens abuse
- JWT tokens: Requires issuing/refresh infrastructure
- OAuth 2.0: Massive complexity, out of scope
- Mutual TLS: Complex client setup

**Trade-offs:**
- ✅ **Wins**: Simple to implement, stateless validation, allows admin keys
- ⚠️ **Costs**: Keys can leak (need rotation), less secure than JWT

**Rationale:** API keys are pragmatic MVP. Close security hole without OAuth complexity. Can migrate to JWT later.

---

#### Summary of Key Decisions

| Decision | Choice | Score | Key Trade-off |
|----------|--------|-------|---------------|
| Storage | MongoDB + Redis | N/A | Complexity vs Performance |
| Collaborative Algorithm | Item-Based CF | 7.3/10 | Stability vs Personalization |
| Computation Schedule | Tiered (trigger/hourly/daily) | N/A | Orchestration vs Freshness |
| Similarity Metric | Cosine Similarity | 8.2/10 | Interpretability vs Accuracy |
| API Protocol | REST | N/A | Simplicity vs Flexibility |
| Association Rules | Simple Co-occurrence → FP-Growth | 8.1/10 | Simplicity vs Sophistication |
| Score Blending | Feature-weighted Linear | 8.4/10 | Explainability vs Accuracy |
| Job Scheduler | BullMQ | 8.6/10 | Infrastructure vs Managed Service |
| **MongoDB Schema** | **Products/Orders/Recommendations with indexes** | **N/A** | **Query Performance vs Storage Cost** |
| **API Versioning** | **URL Path (/v1/)** | **N/A** | **Explicitness vs Verbosity** |
| **Rate Limiting** | **Three-tier (Global/IP/User)** | **N/A** | **Protection vs Latency** |
| **Catalog Triggers** | **Webhook + Polling Fallback** | **N/A** | **Immediacy vs Complexity** |
| **Authentication** | **API Keys (interim)** | **N/A** | **Simplicity vs Security** |

---

### Failure Prevention Measures (from Pre-mortem Analysis)

#### Resilience & Reliability

**Problem:** Redis failures take down entire service.

**Prevention:**
```typescript
// Graceful degradation with fallback
async function getRecommendations(productId: string) {
  try {
    return await redis.get(`recs:${productId}:${currentVersion}`);
  } catch (redisError) {
    logger.warn('Redis unavailable, falling back to MongoDB');
    return await mongo.collection('recommendations').findOne({ productId });
  }
}

// Circuit breaker pattern
// Request timeouts: 5 seconds max
// Health checks independent of Redis
// Redis Sentinel or cluster for HA
```

**Requirements:**
- Redis fallback to MongoDB (accept 500ms latency vs 500 error)
- Circuit breaker on all external dependencies
- 5-second request timeout middleware
- Health endpoint: `GET /health` (checks MongoDB, doesn't require Redis)

---

#### Quality Assurance

**Problem:** Poor recommendations damage user trust and engagement.

**Prevention:**
- **Data validation**: Products with <10 orders excluded from collaborative filtering
- **Confidence thresholds**: Only serve recommendations with score ≥ 0.3
- **Diversity constraints**: Max 3 products from same category in top 10
- **Offline metrics**: Calculate Precision@10, Recall@10, NDCG on held-out test set
- **Manual review**: Spot-check top 100 products' recommendations weekly

**Requirements:**
```typescript
// Filter low-confidence recommendations
recommendations = recommendations.filter(r => r.score >= 0.3);

// Enforce diversity
recommendations = enforceCategoryDiversity(recommendations, maxPerCategory: 3);

// Track quality metrics
await logMetrics({
  precision_at_10: calculatePrecision(predictions, actuals, k=10),
  recall_at_10: calculateRecall(predictions, actuals, k=10),
  ndcg: calculateNDCG(predictions, actuals)
});
```

---

#### Scalability Safeguards

**Problem:** Batch jobs take longer than scheduling interval (4 hours for 1-hour job).

**Prevention:**
- **Incremental updates**: Only recompute similarities for products with new orders since last run
- **Approximate nearest neighbors**: Use ANN libraries (Annoy, hnswlib) for large catalogs
- **Pagination**: Process products in batches of 1000, use cursors
- **Horizontal scaling**: Partition products across multiple workers
- **Job monitoring**: Alert if job duration > 50 minutes

**Requirements:**
```typescript
// Track which products need recomputation
const productsToUpdate = await getProductsWithNewOrdersSince(lastRunTimestamp);

// Batch processing with pagination
for await (const batch of paginateProducts(batchSize: 1000)) {
  await processProductBatch(batch);
}

// Job duration monitoring
if (jobDuration > 50 * 60 * 1000) {
  await alerting.trigger('batch_job_timeout_warning');
}
```

---

#### Cache Invalidation Strategy

**Problem:** Race conditions and inconsistent recommendations during cache updates.

**Prevention:**
- **Versioned keys**: `recs:{productId}:{version}` prevents mixing old/new data
- **Atomic switchover**: Update version pointer atomically after all writes complete
- **TTL safety net**: 2-hour expiration prevents infinite stale data
- **Batch metadata**: Track which version is active, when it was created

**Requirements:**
```typescript
// Write new recommendations with new version
const newVersion = `v${Date.now()}`;
for (const rec of recommendations) {
  await redis.setex(`recs:${rec.productId}:${newVersion}`, 7200, rec.data);
}

// Atomic switchover
await redis.set('rec:current_version', newVersion);

// Store batch metadata
await redis.hset(`batch:${newVersion}`, {
  timestamp: Date.now(),
  productCount: recommendations.length,
  status: 'active'
});

// Cleanup old versions after grace period (e.g., 1 hour)
```

---

#### Observability & Debugging

**Problem:** Can't debug why specific recommendations were made.

**Prevention:**
- **Provenance logging**: Store score breakdowns with each recommendation
- **Debug endpoint**: `GET /debug/recommendations/:id?explain=true` returns full calculation
- **Batch tracking**: Every recommendation tagged with batch ID and timestamp
- **Product freshness**: Dashboard showing "last recommended" timestamp per product

**Requirements:**
```typescript
// Store provenance with recommendations
interface Recommendation {
  productId: string;
  recommendedProductId: string;
  finalScore: number;
  breakdown: {
    contentScore: number;
    collabScore: number;
    assocScore: number;
    weights: [number, number, number];
  };
  reason: 'collaborative' | 'content' | 'association' | 'hybrid';
  batchId: string;
  timestamp: string;
}

// Debug endpoint implementation
app.get('/debug/recommendations/:productId', async (req, res) => {
  const recs = await getRecommendationsWithProvenance(req.params.productId);
  res.json({
    productId: req.params.productId,
    recommendations: recs,
    metadata: {
      batchVersion: currentVersion,
      cacheHit: true,
      computeTime: '2ms'
    }
  });
});
```

---

#### Cold Start Enhancements

**Problem:** New products get zero visibility, sit unsold.

**Prevention:**
- **New product boost**: Multiply scores by 1.5x for products <30 days old
- **Explore/exploit**: 10% of recommendations are randomized for discovery
- **Category fallback**: New products shown alongside popular items in same category
- **Freshness monitoring**: Dashboard tracking days since product was last recommended

**Requirements:**
```typescript
// Apply new product boost
if (isNewProduct(product, days: 30)) {
  score *= 1.5;
}

// Inject exploration
const finalRecs = [...recommendations.slice(0, 9), getRandomProduct()]; // 10% exploration

// Monitor freshness
await metrics.gauge('days_since_last_recommended', calculateDaysSince(product.lastRecommended));
```

---

#### Performance Optimization

**Problem:** Hybrid endpoint takes 30+ seconds, times out frequently.

**Prevention:**
- **Pre-compute hybrid scores**: Blend during batch job, not at request time
- **Parallel fetching**: Use `Promise.all()` for independent data sources
- **Connection pooling**: Reuse MongoDB/Redis connections
- **N+1 prevention**: Batch fetch product details in single query

**Requirements:**
```typescript
// Pre-compute during batch (not at request time)
const hybridScore = blendScores(contentScore, collabScore, assocScore, weights);
await savePrecomputedHybrid(productId, hybridScore);

// Parallel fetching when needed
const [contentRecs, collabRecs, assocRecs] = await Promise.all([
  getContentBased(productId),
  getCollaborative(productId),
  getAssociation(productId)
]);

// Batch product details fetch
const productIds = recommendations.map(r => r.productId);
const products = await mongo.collection('products').find({ 
  _id: { $in: productIds } 
}).toArray();
```

---

### Edge Case & Scale Scenarios (What-If Analysis)

#### Scenario: Large Catalog (>1M Products)

**Problem:** Exact item-item similarity becomes computationally prohibitive (O(n²)).

**Solution:**
```typescript
// Use Approximate Nearest Neighbors for large catalogs
import { AnnoyIndex } from 'annoy-node';

async function buildSimilarityIndex(products: Product[]) {
  const dimension = 100; // Feature vector size
  
  if (products.length > 1_000_000) {
    // Use ANN for large catalogs
    const index = new AnnoyIndex(dimension, 'angular');
    
    products.forEach((p, i) => {
      index.addItem(i, p.featureVector);
    });
    
    index.build(10); // 10 trees for balance of speed/accuracy
    return index;
    
  } else {
    // Use exact similarity for smaller catalogs
    return buildExactSimilarityMatrix(products);
  }
}

// Query: O(log n) instead of O(n)
const similarProducts = annoyIndex.getNNsByItem(productId, 20);
```

**Threshold:** Switch from exact to ANN at 1M products

---

#### Scenario: Extreme Cold Start (99% Products <10 Orders)

**Problem:** Collaborative filtering excludes most products, defeating hybrid purpose.

**Solution:**
```typescript
// Adaptive threshold based on data distribution
function calculateMinOrderThreshold(products: Product[]): number {
  const avgOrders = calculateAverage(products.map(p => p.orderCount));
  
  if (avgOrders < 10) {
    // Lower threshold for sparse data
    const adaptive = Math.max(3, Math.floor(avgOrders * 0.5));
    logger.info(`Adaptive threshold: ${adaptive} (avg orders: ${avgOrders})`);
    return adaptive;
  }
  
  return 10; // Standard threshold
}

// Multi-tier fallback chain
async function getRecommendations(productId: string): Promise<Recommendation[]> {
  // Tier 1: Collaborative (if enough orders)
  if (await hasEnoughOrders(productId)) {
    return getCollaborativeRecs(productId);
  }
  
  // Tier 2: Category popularity
  if (await hasCategory(productId)) {
    return getPopularInCategory(productId);
  }
  
  // Tier 3: Content-based similarity
  const contentRecs = await getContentBasedRecs(productId);
  if (contentRecs.length > 0) {
    return contentRecs;
  }
  
  // Tier 4: Global popular
  return getGlobalPopular();
}
```

**Monitoring:** Alert if >80% of products fall below threshold

---

#### Scenario: Bulk Orders (100+ Products in Single Transaction)

**Problem:** Large orders create thousands of product pairs, skewing association rules.

**Solution:**
```typescript
// Cap and weight large orders
function extractProductPairs(order: Order): ProductPair[] {
  const MAX_ORDER_SIZE = 20;
  
  if (order.products.length > MAX_ORDER_SIZE) {
    logger.info(`Large order detected: ${order.products.length} products`);
    
    // Sample representative products (most popular in order)
    const sampled = sampleRepresentativeProducts(order.products, MAX_ORDER_SIZE);
    return generatePairsWithWeight(sampled, weight: 1.0 / order.products.length);
  }
  
  // Normal order: full weight
  return generatePairsWithWeight(order.products, weight: 1.0);
}

// Weighted co-occurrence scoring
interface ProductPair {
  product1: string;
  product2: string;
  weightedCount: number; // Sum of weights, not raw count
}

function calculateAssociationScore(pair: ProductPair): number {
  // Use weighted count instead of raw count
  return pair.weightedCount / getTotalOrders();
}
```

**Threshold:** Cap at 20 products, weight by `1 / orderSize`

---

#### Scenario: Viral Product (Traffic Spike to Single Product)

**Problem:** Single product receives 10,000 req/s, creating Redis hot spot.

**Solution:**
```typescript
// Hot product detection and optimization
const HOT_PRODUCT_THRESHOLD = 1000; // req/min

async function handleRecommendationRequest(productId: string) {
  const currentMinute = Math.floor(Date.now() / 60000);
  const rateKey = `rate:${productId}:${currentMinute}`;
  
  const requestRate = await redis.incr(rateKey);
  await redis.expire(rateKey, 60);
  
  if (requestRate > HOT_PRODUCT_THRESHOLD) {
    // Mark as hot product
    await redis.sadd('hot_products', productId);
    
    // Extend cache TTL (don't expire while hot)
    await redis.expire(`recs:${productId}`, 3600 * 4); // 4 hours
    
    logger.info(`Hot product detected: ${productId} (${requestRate} req/min)`);
  }
  
  return await getRecommendations(productId);
}

// Skip hot products in batch recomputation (save compute)
async function selectProductsForBatch() {
  const hotProducts = await redis.smembers('hot_products');
  const allProducts = await getAllProducts();
  
  return allProducts.filter(p => !hotProducts.includes(p.id));
}
```

**Benefit:** Reduces batch compute time, extends cache for hot products

---

#### Scenario: Missing or Inconsistent Product Attributes

**Problem:** 30% of products missing "size" attribute, breaking content-based similarity.

**Solution:**
```typescript
// Robust feature extraction with missing data handling
function buildFeatureVector(product: Product): number[] {
  const vector: number[] = [];
  
  // Numeric features: use category median for missing values
  vector.push(
    product.size ?? getCategoryMedian(product.category, 'size')
  );
  vector.push(
    product.price ?? getCategoryMedian(product.category, 'price')
  );
  
  // Categorical: one-hot encode with unknown handling
  const typeEncoding = oneHotEncode(
    product.type, 
    knownTypes, 
    { defaultToUnknown: true }
  );
  vector.push(...typeEncoding);
  
  // Feature presence indicators (helps model know what's real)
  vector.push(product.size !== undefined ? 1 : 0);
  vector.push(product.price !== undefined ? 1 : 0);
  
  return normalizeVector(vector);
}

// Data quality validation before batch
async function validateProductData(products: Product[]): Promise<void> {
  const missingSize = products.filter(p => !p.size).length;
  const missingCategory = products.filter(p => !p.category).length;
  
  const sizeRatio = missingSize / products.length;
  const categoryRatio = missingCategory / products.length;
  
  if (sizeRatio > 0.5 || categoryRatio > 0.5) {
    throw new Error(
      `Data quality too poor: ${sizeRatio * 100}% missing size, ` +
      `${categoryRatio * 100}% missing category`
    );
  }
  
  logger.warn(`Data quality: ${missingSize} products missing size`);
}
```

**Requirement:** Batch job validates data quality before processing

---

#### Scenario: Infrastructure Failure During Batch Job

**Problem:** MongoDB/Redis crashes mid-batch, leaving inconsistent state.

**Solution:**
```typescript
// Transactional batch with rollback capability
async function executeBatchJob() {
  const jobId = `batch_${Date.now()}`;
  const tempVersion = `v${jobId}_temp`;
  
  try {
    // Phase 1: Compute recommendations
    logger.info(`[${jobId}] Computing recommendations...`);
    const recommendations = await computeAllRecommendations();
    
    // Phase 2: Write to temporary space (not live)
    logger.info(`[${jobId}] Writing to temporary version: ${tempVersion}`);
    await writeToCache(recommendations, { version: tempVersion });
    
    // Phase 3: Validate complete write
    const writeCount = await redis.scard(`${tempVersion}:products`);
    if (writeCount !== recommendations.length) {
      throw new Error(
        `Incomplete write: expected ${recommendations.length}, got ${writeCount}`
      );
    }
    
    // Phase 4: Atomic promotion (only if everything succeeded)
    logger.info(`[${jobId}] Promoting to production...`);
    const oldVersion = await redis.get('rec:current_version');
    await redis.set('rec:current_version', tempVersion);
    
    // Phase 5: Cleanup old version after grace period
    setTimeout(() => cleanupOldVersion(oldVersion), 3600 * 1000); // 1 hour
    
    logger.info(`[${jobId}] Successfully completed`);
    await recordJobSuccess(jobId);
    
  } catch (error) {
    // Rollback: delete temp version, keep old live
    logger.error(`[${jobId}] Failed, rolling back`, error);
    await redis.del(`${tempVersion}:*`);
    
    // Alert operations team
    await alerting.trigger('batch_job_failure', { jobId, error });
    
    // Schedule retry with exponential backoff
    await scheduleRetry(jobId, { 
      attempt: currentAttempt + 1,
      backoffMs: Math.pow(2, currentAttempt) * 60000 
    });
    
    throw error;
  }
}

// Checkpoint-based resume for long jobs
async function processWithCheckpoints(products: Product[]) {
  const CHECKPOINT_INTERVAL = 1000;
  
  for (let i = 0; i < products.length; i += CHECKPOINT_INTERVAL) {
    const batch = products.slice(i, i + CHECKPOINT_INTERVAL);
    await processBatch(batch);
    
    // Save checkpoint for resume
    await saveJobCheckpoint({
      jobId: currentJobId,
      productsProcessed: i + batch.length,
      lastProductId: batch[batch.length - 1].id,
      timestamp: Date.now()
    });
  }
}
```

**Benefit:** Zero-downtime deployments, atomic updates, recoverable failures

---

#### Scenario: Business Rules Required (Out of Initial Scope)

**Problem:** Need to filter out-of-stock, boost partners, apply seasonal adjustments.

**Future Extensibility:**
```typescript
// Design for extensibility with post-processing layer
interface BusinessRules {
  filters: RuleFilter[];
  boosters: RuleBooster[];
}

async function applyBusinessRules(
  recommendations: Recommendation[],
  rules: BusinessRules,
  context: RequestContext
): Promise<Recommendation[]> {
  
  let recs = recommendations;
  
  // Apply filters (remove items)
  for (const filter of rules.filters) {
    recs = await filter.apply(recs, context);
  }
  
  // Apply boosters (adjust scores)
  for (const booster of rules.boosters) {
    recs = booster.apply(recs, context);
  }
  
  // Re-sort after boosting
  recs.sort((a, b) => b.score - a.score);
  
  return recs;
}

// Load rules from configuration (not hardcoded)
const rules = await loadBusinessRules('config/business-rules.yaml');
```

**Note:** Not in initial scope, but architecture designed for easy addition

---

### Scale & Edge Case Summary

| Scenario | Trigger Threshold | Mitigation Strategy |
|----------|------------------|---------------------|
| Large catalog | >1M products | Switch to ANN (Annoy/hnswlib) |
| Extreme cold start | Avg orders <10 | Adaptive thresholds, multi-tier fallback |
| Bulk orders | >20 products | Cap size, weight by 1/orderSize |
| Viral product | >1000 req/min | Hot product detection, extended cache TTL |
| Missing attributes | >50% missing | Median imputation, presence indicators |
| Infrastructure failure | Any batch job | Transactional execution, rollback, checkpoints |
| Business rules | Future need | Post-processing layer (design extensibility) |

## Implementation Plan

### Tasks

Implementation order follows dependency hierarchy: infrastructure → models → algorithms → storage → engine → jobs → API → testing → monitoring.

#### Phase 1: Project Setup & Foundation

- [ ] **Task 1.1**: Initialize Node.js/TypeScript project
  - File: `package.json`
  - Action: Create package.json with dependencies listed in Dependencies section
  - Notes: Use npm init, add scripts for build/test/dev/lint

- [ ] **Task 1.2**: Configure TypeScript with strict mode
  - File: `tsconfig.json`
  - Action: Set strict: true, target: ES2022, module: NodeNext, outDir: dist/
  - Notes: Enable strictNullChecks, noImplicitAny, all strict options

- [ ] **Task 1.3**: Setup ESLint and Prettier
  - Files: `.eslintrc.json`, `.prettierrc`
  - Action: Configure TypeScript ESLint parser, add formatting rules
  - Notes: Add lint-staged and husky for pre-commit hooks

- [ ] **Task 1.4**: Create environment configuration with validation
  - Files: `.env.example`, `src/config/env.ts`
  - Action: Define all env vars (critical + optional), implement Zod validation schema
  - Notes: Fail fast on startup if validation fails
  - **Environment Variables Specification**:
    ```typescript
    // Critical (Required)
    MONGODB_URI: string (url, starts with 'mongodb')
    REDIS_URL: string (url, starts with 'redis')
    PORT: number (1-65535)
    NODE_ENV: 'development' | 'production' | 'test'
    API_KEY_SALT: string (min 32 chars, for hashing API keys)
    WEBHOOK_SECRET: string (min 64 chars, for catalog webhooks)
    
    // Optional (With Defaults)
    BATCH_JOB_CONCURRENCY: number (default: 2)
    CACHE_TTL_SECONDS: number (default: 7200)
    HOT_PRODUCT_THRESHOLD: number (default: 1000 req/min)
    RATE_LIMIT_IP_MAX: number (default: 100 req/min)
    RATE_LIMIT_WINDOW_MS: number (default: 60000ms)
    LOG_LEVEL: 'debug'|'info'|'warn'|'error' (default: 'info')
    LOG_FORMAT: 'json'|'pretty' (default: 'json')
    METRICS_PORT: number (default: 9090)
    ENABLE_PROFILING: boolean (default: false)
    MIN_ORDER_THRESHOLD: number (default: 10)
    CONFIDENCE_THRESHOLD: number 0-1 (default: 0.3)
    DIVERSITY_MAX_PER_CATEGORY: number (default: 3)
    
    // Validation with Zod
    import { z } from 'zod';
    const envSchema = z.object({
      MONGODB_URI: z.string().url().startsWith('mongodb'),
      REDIS_URL: z.string().url().startsWith('redis'),
      PORT: z.coerce.number().int().positive().max(65535),
      NODE_ENV: z.enum(['development', 'production', 'test']),
      API_KEY_SALT: z.string().min(32),
      WEBHOOK_SECRET: z.string().min(64),
      BATCH_JOB_CONCURRENCY: z.coerce.number().int().positive().default(2),
      // ... all optional vars with defaults
    });
    export const config = envSchema.parse(process.env);
    ```

- [ ] **Task 1.5**: Setup project directory structure
  - Action: Create directories: src/{api,engine,algorithms,storage,jobs,models,utils}, tests/{unit,integration,e2e}
  - Notes: Follow layered architecture pattern from spec

#### Phase 2: Models & Types

- [ ] **Task 2.1**: Define core TypeScript interfaces
  - File: `src/models/product.ts`
  - Action: Create Product interface (id, attributes, category, technicalProperties)
  - Notes: Use strict typing for technical properties

- [ ] **Task 2.2**: Define order models
  - File: `src/models/order.ts`
  - Action: Create Order interface (id, userId, productIds, timestamp)
  - Notes: Support for weighted pairs extraction

- [ ] **Task 2.3**: Define recommendation models
  - File: `src/models/recommendation.ts`
  - Action: Create Recommendation interface with provenance (scores, breakdown, batchId, timestamp)
  - Notes: Include confidence score, reason enum (collaborative/content/association/hybrid)

- [ ] **Task 2.4**: Define configuration types
  - File: `src/models/config.ts`
  - Action: Create types for BlendingWeights, QualityThresholds, ScaleThresholds
  - Notes: Type-safe configuration management

#### Phase 3: Storage Layer

- [ ] **Task 3.1**: Implement MongoDB client with connection pooling
  - File: `src/storage/mongodb-client.ts`
  - Action: Create MongoDBClient class with connection management, health checks
  - Notes: Use connection pool, implement retry logic, graceful shutdown

- [ ] **Task 3.2**: Implement MongoDB repositories
  - Files: `src/storage/repositories/product-repository.ts`, `order-repository.ts`, `recommendation-repository.ts`
  - Action: Create repository pattern with CRUD operations, pagination, cursors
  - Notes: Use TypeScript generics, implement batch operations

- [ ] **Task 3.3**: Implement Redis client with memory management
  - File: `src/storage/redis-client.ts`
  - Action: Create RedisClient class with connection management, circuit breaker, memory monitoring
  - Notes: Use ioredis, implement versioned keys, TTL management
  - **Redis Configuration**:
    ```typescript
    const redisConfig = {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true
    };
    
    // Memory monitoring
    async function monitorRedisMemory() {
      const info = await redis.info('memory');
      const usedMemory = parseInt(info.match(/used_memory:(\d+)/)[1]);
      const maxMemory = 2 * 1024 * 1024 * 1024; // 2GB
      const utilization = (usedMemory / maxMemory) * 100;
      
      if (utilization > 85) {
        logger.error(`Redis memory critical: ${utilization}%`);
        await alerting.trigger('redis_memory_critical');
      } else if (utilization > 70) {
        logger.warn(`Redis memory high: ${utilization}%`);
      }
      
      metrics.cacheMemoryBytes.set(usedMemory);
    }
    
    // redis.conf settings (deploy-time configuration)
    // maxmemory 2gb
    // maxmemory-policy allkeys-lru
    // maxmemory-samples 5
    // save ""  # Disable RDB
    // appendonly no  # Disable AOF
    ```

- [ ] **Task 3.4**: Implement cache manager with versioning
  - File: `src/storage/cache-manager.ts`
  - Action: Create CacheManager with versioned keys, atomic switchover, fallback to MongoDB
  - Notes: Implement get/set/delete with version awareness, batch metadata tracking

#### Phase 4: Algorithm Layer

- [ ] **Task 4.1**: Implement feature extraction with pre-computed category statistics
  - File: `src/algorithms/feature-extraction.ts`
  - Action: Build feature vector from product attributes, handle missing data with median imputation
  - Notes: Add presence indicators, normalize vectors, validate data quality
  - **Category Statistics Pre-computation**:
    ```typescript
    // Pre-compute once per batch (not per product)
    async function precomputeCategoryStatistics(): Promise<Map<string, CategoryStats>> {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            sizes: { $push: '$technicalProperties.size' },
            prices: { $push: '$technicalProperties.price' },
            weights: { $push: '$technicalProperties.weight' },
            count: { $sum: 1 }
          }
        }
      ];
      
      const results = await mongo.collection('products').aggregate(pipeline).toArray();
      
      const statsMap = new Map();
      for (const result of results) {
        statsMap.set(result._id, {
          category: result._id,
          medians: {
            size: calculateMedian(result.sizes.filter(Boolean)),
            price: calculateMedian(result.prices.filter(Boolean)),
            weight: calculateMedian(result.weights.filter(Boolean))
          },
          counts: { total: result.count }
        });
      }
      
      // Cache in Redis for 24 hours
      await redis.setex('category_stats', 86400, JSON.stringify(Array.from(statsMap)));
      
      return statsMap;
    }
    
    // Use cached stats during feature extraction (no per-product DB queries)
    function buildFeatureVector(product: Product, categoryStats: Map): number[] {
      const stats = categoryStats.get(product.category);
      return [
        product.size ?? stats.medians.size,
        product.price ?? stats.medians.price,
        product.weight ?? stats.medians.weight
      ];
    }
    ```

- [ ] **Task 4.2**: Implement cosine similarity calculator
  - File: `src/algorithms/cosine-similarity.ts`
  - Action: Calculate cosine similarity between feature vectors, implement exact and ANN modes
  - Notes: Use ml-distance library, add ANN fallback (Annoy) for >1M products

- [ ] **Task 4.3**: Implement content-based recommender
  - File: `src/algorithms/content-based.ts`
  - Action: Build similarity matrix, find top-K similar products, apply confidence thresholds
  - Notes: Support incremental updates, cache similarity matrices

- [ ] **Task 4.4**: Implement item-based collaborative filtering with adaptive thresholds
  - File: `src/algorithms/collaborative-filtering.ts`
  - Action: Build item-item similarity matrix from order co-occurrences, apply adaptive thresholds
  - Notes: Filter products below threshold, handle sparse data
  - **Adaptive Threshold Implementation**:
    ```typescript
    function calculateMinOrderThreshold(products: Product[]): number {
      const avgOrders = mean(products.map(p => p.orderCount));
      
      if (avgOrders >= 10) {
        return 10; // Standard threshold
      } else {
        // Scale down proportionally with conservative floor
        return Math.max(3, Math.floor(avgOrders * 0.5));
      }
    }
    
    // Use in filtering
    const threshold = calculateMinOrderThreshold(allProducts);
    const eligibleProducts = products.filter(p => p.orderCount >= threshold);
    logger.info(`CF threshold: ${threshold}, eligible products: ${eligibleProducts.length}`);
    ```

- [ ] **Task 4.5**: Implement association rule mining (co-occurrence)
  - File: `src/algorithms/association-rules.ts`
  - Action: Extract weighted product pairs from orders, calculate co-occurrence scores, cap order size at 20
  - Notes: Weight by 1/orderSize for large orders, prepare for FP-Growth upgrade

- [ ] **Task 4.6**: Implement score blending with context-aware weights
  - File: `src/algorithms/score-blender.ts`
  - Action: Implement feature-weighted linear blending, adjust weights based on user/product age
  - Notes: Support new user weights [0.7, 0.1, 0.2], established [0.2, 0.5, 0.3], new product [0.9, 0.05, 0.05]

#### Phase 5: Recommendation Engine

- [ ] **Task 5.1**: Implement recommendation engine with fallback chains
  - File: `src/engine/recommendation-engine.ts`
  - Action: Orchestrate algorithm calls, implement multi-tier fallback (collaborative → category → content → global)
  - Notes: Apply confidence thresholds (0.3), diversity constraints (max 3 per category)

- [ ] **Task 5.2**: Implement cold start handler
  - File: `src/engine/cold-start-handler.ts`
  - Action: Detect new users/products, apply boosting (1.5x for <30 days), implement explore/exploit (10% random)
  - Notes: Track product age, fallback to category popularity

- [ ] **Task 5.3**: Implement hot product detection
  - File: `src/engine/hot-product-detector.ts`
  - Action: Track request rates (>1000 req/min), extend cache TTL for hot products, skip in batch jobs
  - Notes: Use Redis counters with 60s expiration, maintain hot_products set

- [ ] **Task 5.4**: Implement data quality validator
  - File: `src/utils/data-validator.ts`
  - Action: Validate product data quality (<50% missing attributes), adaptive threshold calculation
  - Notes: Reject batch if data quality too poor, log quality metrics

#### Phase 6: Background Jobs

- [ ] **Task 6.1**: Setup BullMQ queue and workers with auto-scaling
  - File: `src/jobs/queue-manager.ts`
  - Action: Initialize BullMQ with Redis, create queues, implement auto-scaling based on queue depth
  - Notes: Configure retry logic, dead letter queues, job priorities
  - **Scaling Rules**:
    ```typescript
    const SCALING_RULES = {
      'content-based': { min: 1, max: 5, scaleUpAt: 100, scaleDownAt: 10 },
      'collaborative': { min: 2, max: 10, scaleUpAt: 50, scaleDownAt: 5 },
      'association': { min: 1, max: 4, scaleUpAt: 75, scaleDownAt: 8 }
    };
    ```

- [ ] **Task 6.2**: Implement content-based batch job
  - File: `src/jobs/content-based-job.ts`
  - Action: Trigger on catalog changes, compute similarity for all/changed products, write to cache with new version
  - Notes: Implement checkpointing every 1000 products, transactional execution

- [ ] **Task 6.3**: Implement collaborative filtering batch job
  - File: `src/jobs/collaborative-job.ts`
  - Action: Run hourly, compute item-item similarities from recent orders, incremental updates only
  - Notes: Skip hot products, implement pagination, alert if duration >50min

- [ ] **Task 6.4**: Implement association rules batch job
  - File: `src/jobs/association-job.ts`
  - Action: Run daily, extract weighted product pairs, calculate co-occurrence scores
  - Notes: Cap order size at 20, weight large orders, store top 20 associations per product

- [ ] **Task 6.5**: Implement transactional batch executor with version history and quality gates
  - File: `src/jobs/batch-executor.ts`
  - Action: Wrap batch jobs with transactional logic: temp version → validate → quality gates → atomic promotion → smart cache warming → cleanup
  - Notes: Implement rollback on failure, retry with exponential backoff, save checkpoints for resume
  - **Version History & Rollback**:
    ```typescript
    interface RecommendationVersion {
      version: string;
      timestamp: number;
      status: 'active' | 'previous' | 'archived';
      metrics: { avgScore: number; coverage: number; diversityScore: number; };
    }
    
    // Quality gates before promotion
    async function validateRecommendations(newVersion: string): Promise<boolean> {
      const sample = await sampleRecommendations(newVersion, 1000);
      
      const avgScore = mean(sample.map(r => r.score));
      const coverage = await calculateCoverage(newVersion);
      const diversityScore = calculateDiversity(sample);
      
      if (avgScore < 0.4) {
        logger.error(`Quality gate failed: avgScore ${avgScore} < 0.4`);
        return false;
      }
      if (coverage < 0.7) {
        logger.error(`Quality gate failed: coverage ${coverage} < 0.7`);
        return false;
      }
      if (diversityScore < 0.6) {
        logger.error(`Quality gate failed: diversity ${diversityScore} < 0.6`);
        return false;
      }
      
      return true;
    }
    
    // Rollback command (manual trigger via admin API)
    async function rollbackRecommendations() {
      const currentVersion = await redis.get('rec:current_version');
      const previousVersion = await redis.get('rec:previous_version');
      
      if (!previousVersion) {
        throw new Error('No previous version available');
      }
      
      // Atomic swap
      await redis.set('rec:current_version', previousVersion);
      await redis.set('rec:previous_version', currentVersion);
      
      logger.info(`Rolled back from ${currentVersion} to ${previousVersion}`);
      await alerting.trigger('recommendation_rollback');
    }
    
    // Keep version history (last 3 versions)
    await redis.set('rec:current_version', newVersion);
    await redis.set('rec:previous_version', oldVersion);
    await redis.set('rec:archived_version', archivedVersion);
    ```
  - **Cache Warming Implementation**:
    ```typescript
    async function warmCacheAfterPromotion(newVersion: string) {
      const hotProducts = await redis.smembers('hot_products');
      const toWarm = hotProducts.slice(0, 100);
      
      for (const productId of toWarm) {
        const recs = await mongo.collection('recommendations')
          .findOne({ productId, version: newVersion });
        await redis.setex(`recs:${productId}:${newVersion}`, 14400, JSON.stringify(recs));
      }
      
      logger.info(`Cache warmed with ${toWarm.length} hot products`);
    }
    ```

#### Phase 7: API Layer

- [ ] **Task 7.1**: Setup Express server with middleware
  - File: `src/server.ts`
  - Action: Initialize Express, add middleware (cors, helmet, compression, timeout, error handler)
  - Notes: 5-second request timeout, structured logging with correlation IDs

- [ ] **Task 7.2**: Implement recommendation routes with pagination
  - File: `src/api/routes/recommendations.ts`
  - Action: Create GET endpoints with limit/offset pagination, validate params with Zod
  - Notes: Validate params, handle errors gracefully, return provenance data + pagination metadata
  - **Pagination Specification**:
    ```typescript
    app.get('/v1/products/:productId/similar', async (req, res) => {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
      const offset = parseInt(req.query.offset) || 0;
      
      if (limit < 1 || limit > 100) {
        return res.status(400).json({ error: 'limit must be 1-100' });
      }
      if (offset < 0) {
        return res.status(400).json({ error: 'offset must be >= 0' });
      }
      
      const allRecs = await getRecommendations(req.params.productId);
      const page = allRecs.slice(offset, offset + limit);
      
      res.json({
        productId: req.params.productId,
        recommendations: page,
        pagination: {
          limit,
          offset,
          total: allRecs.length,
          hasMore: offset + limit < allRecs.length
        }
      });
    });
    ```

- [ ] **Task 7.3**: Implement debug endpoint with admin authentication
  - File: `src/api/routes/debug.ts`
  - Action: Create GET /debug/v1/recommendations/:id?explain=true with full score breakdown
  - Notes: Require admin API key, include batch metadata, cache hit status, computation time
  - **Security Requirements**:
    ```typescript
    // Require admin API key for debug endpoints
    async function requireAdminApiKey(req, res, next) {
      const apiKey = req.headers['x-api-key'];
      
      if (!apiKey) {
        return res.status(401).json({ error: 'Admin API key required for debug endpoints' });
      }
      
      const keyData = await getApiKeyData(apiKey);
      
      if (!keyData || !keyData.isAdmin) {
        return res.status(403).json({ error: 'Admin privileges required' });
      }
      
      req.apiKeyData = keyData;
      next();
    }
    
    // Apply to debug routes
    app.get('/debug/v1/recommendations/:productId', requireAdminApiKey, async (req, res) => {
      const recs = await getRecommendationsWithProvenance(req.params.productId);
      res.json({
        productId: req.params.productId,
        recommendations: recs, // Full score breakdown included
        metadata: {
          batchVersion: currentVersion,
          cacheHit: true,
          computeTime: '2ms'
        }
      });
    });
    
    // Optional: IP whitelist for additional security
    // const INTERNAL_IPS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
    ```

- [ ] **Task 7.4**: Implement health check endpoint
  - File: `src/api/routes/health.ts`
  - Action: Create GET /health checking MongoDB (required), Redis (optional with degraded status)
  - Notes: Return 200 if MongoDB up, 503 if down, 200 with warning if Redis down

- [ ] **Task 7.5**: Implement circuit breaker middleware
  - File: `src/api/middleware/circuit-breaker.ts`
  - Action: Wrap Redis calls with Opossum circuit breaker, fallback to MongoDB on open circuit
  - Notes: Configure thresholds (5 failures in 10s), 30s timeout, half-open retry

#### Phase 8: Utilities & Monitoring

- [ ] **Task 8.1**: Setup structured logging with Winston
  - File: `src/utils/logger.ts`
  - Action: Configure Winston with JSON format, correlation IDs, log levels by environment
  - Notes: Log to console (dev) and file (prod), include timestamp, context

- [ ] **Task 8.2**: Setup Prometheus metrics with comprehensive instrumentation
  - File: `src/utils/metrics.ts`
  - Action: Create metrics: request_duration, cache_hit_rate, batch_job_duration, recommendation_quality
  - Notes: Expose /metrics endpoint, track percentiles (p50, p95, p99)
  - **Prometheus Metrics Specification**:
    ```typescript
    import promClient from 'prom-client';
    
    // 1. API Performance
    const httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });
    
    const httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });
    
    // 2. Cache Performance
    const cacheOperations = new promClient.Counter({
      name: 'cache_operations_total',
      help: 'Total cache operations',
      labelNames: ['operation', 'result'] // get|set|delete, hit|miss|error
    });
    
    const cacheMemoryBytes = new promClient.Gauge({
      name: 'cache_memory_bytes',
      help: 'Redis memory usage in bytes'
    });
    
    const cacheHitRate = new promClient.Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate (hits / total)'
    });
    
    // 3. Batch Jobs
    const batchJobDuration = new promClient.Histogram({
      name: 'batch_job_duration_seconds',
      help: 'Batch job duration',
      labelNames: ['job_type', 'status'],
      buckets: [60, 300, 600, 1800, 3000] // 1min to 50min
    });
    
    const batchJobExecutions = new promClient.Counter({
      name: 'batch_job_executions_total',
      help: 'Total batch job executions',
      labelNames: ['job_type', 'status']
    });
    
    const queueDepth = new promClient.Gauge({
      name: 'batch_queue_depth',
      help: 'Jobs waiting in queue',
      labelNames: ['queue_name']
    });
    
    const activeWorkers = new promClient.Gauge({
      name: 'batch_active_workers',
      help: 'Active workers',
      labelNames: ['queue_name']
    });
    
    // 4. Recommendation Quality
    const recommendationScores = new promClient.Histogram({
      name: 'recommendation_score_distribution',
      help: 'Distribution of recommendation scores',
      labelNames: ['recommendation_type'],
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    });
    
    const recommendationCoverage = new promClient.Gauge({
      name: 'recommendation_coverage_ratio',
      help: 'Ratio of products with recommendations',
      labelNames: ['recommendation_type']
    });
    
    const coldStartFallbacks = new promClient.Counter({
      name: 'cold_start_fallbacks_total',
      help: 'Fallback logic invocations',
      labelNames: ['fallback_tier'] // collaborative|category|content|global
    });
    
    // 5. Infrastructure
    const mongodbConnections = new promClient.Gauge({
      name: 'mongodb_connections',
      help: 'MongoDB connection pool status',
      labelNames: ['state'] // available|in_use|total
    });
    
    const circuitBreakerStateChanges = new promClient.Counter({
      name: 'circuit_breaker_state_changes_total',
      help: 'Circuit breaker state transitions',
      labelNames: ['circuit', 'from_state', 'to_state']
    });
    
    // Alerting Rules (for Prometheus AlertManager)
    // - HighAPILatency: p95 > 100ms for 5min
    // - LowCacheHitRate: hit rate < 0.8 for 10min
    // - BatchJobTimeout: duration > 3000s
    // - RedisMemoryHigh: usage > 85% for 5min
    // - HighErrorRate: 5xx rate > 5% for 5min
    ```

- [ ] **Task 8.3**: Implement provenance logger
  - File: `src/utils/provenance-logger.ts`
  - Action: Log recommendation decisions with full score breakdown, batch ID, timestamp
  - Notes: Store in separate collection for debugging, implement sampling (10% in prod)

- [ ] **Task 8.4**: Setup alerting rules
  - File: `src/utils/alerting.ts`
  - Action: Define alert conditions: batch job >50min, error rate >5%, cache hit <80%
  - Notes: Integrate with monitoring system (webhook/email), include runbooks

#### Phase 9: Testing

- [ ] **Task 9.1**: Write unit tests for algorithms
  - Files: `tests/unit/algorithms/*.test.ts`
  - Action: Test cosine similarity, CF, association rules, score blending with known datasets
  - Notes: 90%+ coverage target, use golden test data, test edge cases (empty, sparse, large)

- [ ] **Task 9.2**: Write integration tests for storage layer
  - Files: `tests/integration/storage/*.test.ts`
  - Action: Test MongoDB ↔ Redis sync, cache invalidation, fallback behavior
  - Notes: Use testcontainers for MongoDB/Redis, test atomic switchover

- [ ] **Task 9.3**: Write integration tests for batch jobs
  - Files: `tests/integration/jobs/*.test.ts`
  - Action: Test job execution, rollback on failure, checkpoint resume
  - Notes: Mock BullMQ, verify transactional behavior, test retry logic

- [ ] **Task 9.4**: Write API endpoint tests
  - Files: `tests/integration/api/*.test.ts`
  - Action: Test all endpoints with Supertest, verify response schemas, error handling
  - Notes: Test timeout behavior, circuit breaker triggers, debug endpoint output

- [ ] **Task 9.5**: Write chaos/resilience tests
  - Files: `tests/e2e/chaos/*.test.ts`
  - Action: Kill Redis mid-request, verify MongoDB fallback, test batch job failure recovery
  - Notes: Use testcontainers, verify graceful degradation, check metrics

- [ ] **Task 9.6**: Implement load tests
  - Files: `tests/load/recommendations.load.ts`
  - Action: Test 1000 req/s sustained load, verify <100ms p95 latency, cache hit rates
  - Notes: Use k6 or Artillery, ramp up gradually, monitor resource usage

#### Phase 10: Documentation & Deployment

- [ ] **Task 10.1**: Write README with setup instructions
  - File: `README.md`
  - Action: Document architecture, setup steps, environment variables, running locally
  - Notes: Include quick start, troubleshooting, architecture diagram

- [ ] **Task 10.2**: Document API with OpenAPI spec
  - File: `docs/api-spec.yaml`
  - Action: Create OpenAPI 3.0 spec for all endpoints with examples
  - Notes: Include error responses, authentication (future), rate limits

- [ ] **Task 10.3**: Create Docker Compose for local development
  - File: `docker-compose.yml`
  - Action: Define services: app, MongoDB, Redis, Redis Commander, Mongo Express
  - Notes: Volume mounts for hot reload, health checks, network configuration

- [ ] **Task 10.4**: Create Dockerfile for production
  - File: `Dockerfile`
  - Action: Multi-stage build (build → production), non-root user, minimal image
  - Notes: Use Node 20 Alpine, copy only dist and package.json, healthcheck

- [ ] **Task 10.5**: Write deployment and backup/DR guide
  - File: `docs/deployment.md`
  - Action: Document deployment options, scaling strategy, monitoring setup, backup/DR procedures
  - Notes: Include Redis cluster setup, MongoDB replica set, BullMQ worker scaling
  - **Backup/DR Specification**:
    ```yaml
    Critical Data (orders, products):
      Strategy: Daily snapshots + transaction logs
      RPO: 1 hour (max data loss)
      RTO: 30 minutes (max recovery time)
      Retention: 7 daily, 4 weekly, 3 monthly
      Tools: MongoDB Atlas backup or mongodump + S3
    
    Derived Data (recommendations):
      Strategy: No backup (recompute from orders/products)
      RPO: 0 (by definition - always recomputable)
      RTO: 2 hours (full recomputation time)
      Process: Restore orders/products → trigger all batch jobs
    
    Redis Cache:
      Strategy: No backup (ephemeral cache only)
      RTO: 0 (lazy warming on cache miss)
      Recovery: Automatic via cache warming and on-demand loading
    
    Disaster Recovery Steps:
      1. Restore latest MongoDB snapshot
      2. Apply transaction logs (if available)
      3. Trigger content-based batch job
      4. Trigger collaborative batch job
      5. Trigger association rules batch job
      6. Verify data quality and completeness
      7. Monitor cache hit rates return to normal
    ```

### Acceptance Criteria

#### Core Functionality

- [ ] **AC1**: Given a valid productId, when GET /products/{productId}/similar is called, then returns top 20 similar products with scores >0.3 based on cosine similarity
- [ ] **AC2**: Given a valid productId, when GET /products/{productId}/frequently-bought-with is called, then returns top 20 frequently co-purchased products based on association rules
- [ ] **AC3**: Given a valid userId, when GET /users/{userId}/recommended is called, then returns top 20 personalized recommendations using collaborative filtering
- [ ] **AC4**: Given a valid productId and userId, when GET /v1/products/{productId}/recommendations?userId={userId}&limit=20 is called, then returns hybrid recommendations with context-aware weight blending and pagination metadata

#### Algorithm Quality

- [ ] **AC5**: Given products with complete technical attributes, when content-based similarity is computed, then cosine similarity scores are between 0 and 1
- [ ] **AC6**: Given order history data, when collaborative filtering runs, then only products with ≥10 orders are included (or adaptive threshold if sparse data)
- [ ] **AC7**: Given orders with >20 products, when association rules are computed, then order is capped at 20 products and weighted by 1/orderSize
- [ ] **AC8**: Given a new product (<30 days old), when recommendations are computed, then scores are boosted by 1.5x
- [ ] **AC9**: Given recommendations from multiple algorithms, when score blending is applied, then weights sum to 1.0 and final scores are correctly calculated

#### Data Quality & Validation

- [ ] **AC10**: Given product data with >50% missing critical attributes, when batch job starts, then job fails with data quality error
- [ ] **AC11**: Given product with missing size attribute, when feature vector is built, then category median is used as imputation
- [ ] **AC12**: Given recommendations with scores <0.3, when filtering is applied, then low-confidence recommendations are excluded
- [ ] **AC13**: Given top 20 recommendations with >3 products from same category, when diversity constraint is applied, then only 3 per category are kept

#### Performance & Scalability

- [ ] **AC14**: Given cached recommendations in Redis, when API request is made, then response time is <100ms at p95
- [ ] **AC15**: Given Redis is unavailable, when API request is made, then service falls back to MongoDB and returns response in <500ms
- [ ] **AC16**: Given 1000 req/s sustained load, when load test runs, then service maintains <100ms p95 latency with 99.9% success rate
- [ ] **AC17**: Given a product with >1000 req/min, when hot product detection runs, then product is marked hot and cache TTL is extended to 4 hours

#### Batch Jobs & Pre-computation

- [ ] **AC18**: Given catalog changes, when content-based batch job runs, then similarity matrix is recomputed for changed products only
- [ ] **AC19**: Given hourly collaborative filtering job, when job runs, then completes in <50 minutes and updates Redis with new version
- [ ] **AC20**: Given daily association rules job, when job runs, then processes all orders and stores top 20 associations per product
- [ ] **AC21**: Given batch job fails mid-execution, when failure occurs, then temp version is deleted and old version remains active (rollback)
- [ ] **AC22**: Given batch job completes successfully, when promotion happens, then version switchover is atomic (no mixed old/new data)

#### Resilience & Error Handling

- [ ] **AC23**: Given Redis connection fails, when circuit breaker opens, then subsequent requests bypass Redis and use MongoDB fallback
- [ ] **AC24**: Given MongoDB is unavailable, when health check is called, then returns 503 status with error message
- [ ] **AC25**: Given API request exceeds 5 seconds, when timeout occurs, then request is terminated and 504 response is returned
- [ ] **AC26**: Given invalid productId, when API request is made, then returns 404 with clear error message
- [ ] **AC27**: Given malformed request parameters, when validation fails, then returns 400 with field-specific error messages

#### Observability & Debugging

- [ ] **AC28**: Given any recommendation request, when processed, then provenance data (scores, breakdown, batchId) is stored
- [ ] **AC29**: Given debug endpoint is called with admin API key and ?explain=true, when response is returned, then includes full score breakdown and batch metadata
- [ ] **AC30**: Given batch job completes, when metrics are checked, then job duration, product count, and success status are logged
- [ ] **AC31**: Given /metrics endpoint is called, when Prometheus scrapes, then returns cache hit rate, API latency percentiles, batch job metrics
- [ ] **AC32**: Given recommendation quality degrades, when offline metrics (using multi-signal ground truth) show Precision@10 <0.5, then alert is triggered

#### Version Management & Rollback

- [ ] **AC41**: Given batch job completes with quality gate validation, when avgScore <0.4 OR coverage <0.7 OR diversity <0.6, then promotion is rejected and temp version is deleted
- [ ] **AC42**: Given successful batch promotion, when version history is checked, then last 3 versions (current, previous, archived) are maintained
- [ ] **AC43**: Given bad recommendations deployed, when manual rollback command is executed, then current and previous versions are swapped atomically within 1 minute

#### API Pagination

- [ ] **AC44**: Given recommendation endpoint with ?limit=50&offset=100, when request is made, then returns 50 items starting from position 100 with pagination metadata (total, hasMore)
- [ ] **AC45**: Given recommendation endpoint with ?limit=200, when request is made, then returns 400 error with message "limit must be 1-100"
- [ ] **AC46**: Given recommendation endpoint with no limit param, when request is made, then defaults to 20 items with pagination metadata

#### Cold Start & Edge Cases

- [ ] **AC33**: Given a new user with no order history, when recommendations are requested, then falls back to popular products in relevant categories
- [ ] **AC34**: Given a new product with no orders, when recommendations are requested, then returns content-based similarity only
- [ ] **AC35**: Given a product with no similar items (orphan), when recommendations are requested, then falls back to global popular products
- [ ] **AC36**: Given 10% explore/exploit enabled, when 100 recommendation requests are made, then ~10 include random products for discovery

#### Testing & Quality

- [ ] **AC37**: Given algorithm unit tests, when test suite runs, then achieves >90% code coverage
- [ ] **AC38**: Given integration tests for storage layer, when tests run, then verifies MongoDB ↔ Redis sync and fallback behavior
- [ ] **AC39**: Given chaos tests, when Redis is killed mid-request, then API successfully falls back to MongoDB without errors
- [ ] **AC40**: Given load tests at 1000 req/s, when sustained for 5 minutes, then no memory leaks and p99 latency <200ms

## Additional Context

### Dependencies

**Core Dependencies:**
- `express` - REST API framework
- `mongodb` - MongoDB driver
- `ioredis` - Redis client with cluster support
- `bullmq` - Job queue and scheduler
- `typescript` - Type safety
- `zod` - Runtime validation (env vars, request schemas)
- `dotenv` - Environment variable loading

**Algorithm Libraries:**
- `ml-distance` - Cosine similarity, distance metrics
- `mathjs` - Vector normalization, matrix operations
- `annoy-node` or `hnswlib-node` - Approximate Nearest Neighbors (for >1M products)
- For future FP-Growth: `node-fp-growth` or similar

**Resilience & Monitoring:**
- `opossum` - Circuit breaker implementation
- `prom-client` - Prometheus metrics
- `winston` - Structured logging
- `express-timeout-handler` - Request timeouts
- `express-rate-limit` - Rate limiting
- `rate-limit-redis` - Redis store for rate limits

**Quality & Testing:**
- `jest` - Unit and integration testing
- `supertest` - API endpoint testing
- `@testcontainers/mongodb` - MongoDB test containers
- `@testcontainers/redis` - Redis test containers
- Custom metrics calculation for Precision@K, Recall@K, NDCG

**Environment Variable Specification:**

See Task 1.4 for complete specification. Summary:

**Critical (6 required):**
- `MONGODB_URI` - MongoDB connection string (must start with 'mongodb://' or 'mongodb+srv://')
- `REDIS_URL` - Redis connection string (must start with 'redis://')
- `PORT` - API server port (1-65535)
- `NODE_ENV` - Environment mode (development|production|test)
- `API_KEY_SALT` - For hashing API keys (min 32 chars)
- `WEBHOOK_SECRET` - For validating catalog webhooks (min 64 chars)

**Optional (13 with defaults):**
- Performance: `BATCH_JOB_CONCURRENCY` (default: 2), `CACHE_TTL_SECONDS` (default: 7200), `HOT_PRODUCT_THRESHOLD` (default: 1000)
- Rate Limiting: `RATE_LIMIT_IP_MAX` (default: 100), `RATE_LIMIT_WINDOW_MS` (default: 60000)
- Logging: `LOG_LEVEL` (default: 'info'), `LOG_FORMAT` (default: 'json')
- Monitoring: `METRICS_PORT` (default: 9090), `ENABLE_PROFILING` (default: false)
- Algorithms: `MIN_ORDER_THRESHOLD` (default: 10), `CONFIDENCE_THRESHOLD` (default: 0.3), `DIVERSITY_MAX_PER_CATEGORY` (default: 3)

**Validation:** All env vars validated using Zod schema at startup. Service fails fast with clear error messages if validation fails.

### Testing Strategy

**Unit Tests:**
- Algorithm correctness (cosine similarity, score blending formulas)
- Data validation logic (min thresholds, confidence filtering)
- Cache key generation and versioning logic
- Fallback chain behavior

**Integration Tests:**
- MongoDB ↔ Redis data flow
- BullMQ job execution and retry logic
- API endpoints with mocked recommendations
- Circuit breaker triggers and recovery

**End-to-End Tests:**
- Full recommendation flow: order data → batch job → API response
- Cache invalidation and atomic switchover
- Graceful degradation (Redis down scenario)
- Performance benchmarks (< 100ms target)

**Quality Tests:**
- Offline evaluation on held-out test set
- Diversity constraint validation
- New product visibility checks
- Score distribution analysis (no NaN, no negatives)
- **Ground Truth Specification for Offline Metrics**:
  ```typescript
  // Multi-signal ground truth for recommendation quality
  interface GroundTruth {
    userId: string;
    productId: string;
    isPositive: boolean; // True if any positive signal
    signals: {
      clicked?: Date;      // Within 7 days of showing
      purchased?: Date;    // Within 30 days
      rated?: number;      // 4-5 stars
      addedToCart?: Date;  // Same session
    };
  }
  
  // Positive signal if ANY of:
  function isPositiveSignal(feedback: GroundTruth): boolean {
    return (
      (feedback.signals.clicked && daysSince(feedback.signals.clicked) < 7) ||
      (feedback.signals.purchased && daysSince(feedback.signals.purchased) < 30) ||
      (feedback.signals.rated && feedback.signals.rated >= 4) ||
      (feedback.signals.addedToCart !== undefined)
    );
  }
  
  // Offline evaluation using historical order data
  async function evaluateRecommendationQuality(): Promise<QualityMetrics> {
    // Use last 30 days as test set
    const testOrders = await getOrdersInRange(thirtyDaysAgo, now);
    
    let hits = 0;
    let total = 0;
    
    for (const order of testOrders) {
      // Get recommendations as they would have been BEFORE the order
      const recsAtTime = await getRecommendationsAsOf(order.userId, order.timestamp);
      const actualPurchased = order.productIds;
      
      const intersection = recsAtTime.slice(0, 10)
        .filter(r => actualPurchased.includes(r.productId));
      
      hits += intersection.length;
      total += Math.min(10, actualPurchased.length);
    }
    
    return {
      precision_at_10: hits / total,
      recall_at_10: hits / testOrders.reduce((sum, o) => sum + o.productIds.length, 0)
    };
  }
  ```

**Load Tests:**
- API throughput: 1000 req/s target
- Batch job with 100K products
- Redis failover scenario
- Concurrent batch job execution

**Monitoring:**
- Recommendation quality metrics dashboard
- Job duration tracking and alerting
- Cache hit rate monitoring
- Per-product freshness tracking

### Notes

- Starting from scratch - no existing codebase
- Focus on algorithmic approaches (no ML infrastructure needed)
- **Key Architectural Decisions from First Principles Analysis**:
  1. **Tiered pre-computation**: Not all recommendations need same refresh rate
  2. **Redis for hot path**: Sub-100ms responses require in-memory cache
  3. **Item-based CF**: More stable than user-based for batch processing
  4. **Fallback chains**: Cold start → content-based → collaborative (graceful degradation)
  5. **Lazy computation**: First request computes, subsequent requests hit cache
- **Data Velocity Considerations**:
  - Product catalog: Low velocity (trigger-based recompute)
  - Order history: Medium velocity (hourly collaborative refresh)
  - Association patterns: Medium-low velocity (daily batch sufficient)
- **Cold Start Strategy**:
  - New products: Use attribute similarity only until order history accumulates
  - New users: Recommend popular items + attribute-based suggestions
  - Fallback chain ensures no empty recommendation responses
- **Hybrid Score Blending Formula** (from comparative analysis):
  ```typescript
  finalScore = w_content * contentScore 
             + w_collab * collabScore 
             + w_assoc * assocScore
  
  // Context-aware weights:
  // - New user: [0.7, 0.1, 0.2]
  // - Established user: [0.2, 0.5, 0.3]
  // - New product: [0.9, 0.05, 0.05]
  ```


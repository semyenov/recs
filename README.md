# Product Recommendation Service

A hybrid product recommendation service built with TypeScript, MongoDB, and Redis. Provides intelligent product recommendations using content-based filtering, collaborative filtering, and association rules.

## Features

- **Hybrid Recommendation Engine**: Combines multiple algorithms for accurate recommendations
  - Content-based filtering (cosine similarity on product attributes)
  - Collaborative filtering (item-based, using user purchase history)
  - Association rules (frequently bought together)
- **High Performance**: Redis caching layer with MongoDB for persistent storage
- **Scalable Architecture**: Background job processing with BullMQ
- **Production Ready**: Rate limiting, circuit breakers, Prometheus metrics, structured logging
- **API Versioning**: RESTful API with URL path versioning (`/v1/`)
- **Quality Assurance**: Automated quality gates before deploying new recommendations
- **Version Management**: Rollback capability for bad recommendation versions

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Client    │─────▶│   REST API   │─────▶│   Redis     │
└─────────────┘      │  (Express)   │      │  (Cache)    │
                     └──────────────┘      └─────────────┘
                            │                      │
                            │                      │
                            ▼                      ▼
                     ┌──────────────┐      ┌─────────────┐
                     │   MongoDB    │◀─────│   BullMQ    │
                     │  (Storage)   │      │  (Jobs)     │
                     └──────────────┘      └─────────────┘
```

## Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 6.0
- Redis >= 7.0
- npm >= 9.0.0

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd recommendations
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# MongoDB
MONGODB_URI=mongodb://localhost:27017/recommendations
MONGODB_DB_NAME=recommendations

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin API Keys (comma-separated)
ADMIN_API_KEYS=your-admin-key-here
```

5. Build the project:
```bash
npm run build
```

## Running the Service

### Development Mode

Start API server:
```bash
npm run dev
```

Start background worker:
```bash
npm run worker
```

### Production Mode

Build and start:
```bash
npm run build
npm start           # API server
npm run worker      # Background worker (in separate terminal)
```

## API Documentation

### Authentication

All API endpoints (except `/health` and `/metrics`) require an API key:

```bash
curl -H "x-api-key: your-api-key" http://localhost:3000/v1/products/P001/similar
```

### Endpoints

#### Get Similar Products (Content-Based)
```bash
GET /v1/products/{productId}/similar?limit=20&offset=0
```

Response:
```json
{
  "productId": "P001",
  "recommendations": [
    { "productId": "P002", "score": 0.95, "rank": 1 },
    { "productId": "P003", "score": 0.87, "rank": 2 }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 50,
    "hasMore": true
  },
  "metadata": {
    "version": "v1234567890",
    "cacheHit": true,
    "computeTime": 5
  }
}
```

#### Get Frequently Bought With (Association Rules)
```bash
GET /v1/products/{productId}/frequently-bought-with?limit=20&offset=0
```

#### Get Personalized Recommendations
```bash
GET /v1/users/{userId}/recommended?limit=20&offset=0
```

#### Get Hybrid Recommendations
```bash
GET /v1/products/{productId}/recommendations?userId={userId}&limit=20&offset=0
```

#### Debug Endpoint (Admin Only)
```bash
GET /debug/v1/recommendations/{productId}?explain=true
```

Returns full score breakdown and batch metadata.

#### Manual Rollback (Admin Only)
```bash
POST /debug/v1/rollback
```

Rolls back to the previous recommendation version.

#### Health Check
```bash
GET /health
```

#### Prometheus Metrics
```bash
GET /metrics
```

## Testing

Run all tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test
```

Run integration tests:
```bash
npm run test:integration
```

Run E2E tests:
```bash
npm run test:e2e
```

## Monitoring

### Prometheus Metrics

Available at `http://localhost:3000/metrics`:

- `recommendations_api_requests_total` - Total API requests by endpoint and status
- `recommendations_api_request_duration_seconds` - Request latency histogram
- `recommendations_cache_hits_total` / `recommendations_cache_misses_total` - Cache performance
- `recommendations_batch_job_duration_seconds` - Batch job execution time
- `recommendations_quality_avg_score` - Average recommendation score
- `recommendations_coverage` - % of products with recommendations

### Logging

Structured JSON logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only

Log level can be configured via `LOG_LEVEL` environment variable.

## Background Jobs

The service runs three batch jobs to pre-compute recommendations:

1. **Content-Based** (Daily at 2 AM): Computes product similarity based on attributes
2. **Collaborative Filtering** (Hourly): Computes item-based similarities from user orders
3. **Association Rules** (Daily at 3 AM): Mines frequently bought together patterns

### Job Scheduling

Jobs are scheduled using BullMQ with Redis as the queue backend. Concurrency and retry policies are configurable via environment variables.

### Quality Gates

Before promoting a new batch version, the following quality gates are checked:

- Average score >= 0.4
- Coverage >= 70% (% of products with recommendations)
- Diversity >= 60% (unique products recommended)

If quality gates fail, the batch version is rejected and previous version remains active.

## Configuration

### Environment Variables

See `.env.example` for all configuration options.

Key settings:
- `BATCH_SIZE` - Number of products processed per batch chunk
- `PRE_COMPUTE_TOP_N` - Number of recommendations to pre-compute per product
- `MIN_SCORE_THRESHOLD` - Minimum score for recommendations to be included
- `DIVERSITY_THRESHOLD` - Diversity constraint for recommendation blending
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per IP per minute

## Deployment

### Docker (Recommended)

Coming soon.

### Manual Deployment

1. Ensure MongoDB and Redis are running
2. Set production environment variables
3. Build the project: `npm run build`
4. Start API server: `npm start`
5. Start worker: `npm run worker`
6. Configure reverse proxy (nginx) for SSL and load balancing
7. Set up Prometheus scraping for `/metrics` endpoint
8. Configure log aggregation (e.g., ELK stack)

## Architecture Decisions

See `_bmad-output/implementation-artifacts/tech-spec-product-recommendation-service.md` for detailed architecture decision records (ADRs), including:

- ADR-001: Tiered Storage Architecture (MongoDB + Redis)
- ADR-002: Item-Based Collaborative Filtering
- ADR-003: Multiple Pre-Computation Schedules
- ADR-004: Cosine Similarity for Content-Based Filtering
- ADR-009: MongoDB Schema Design
- ADR-010: API Versioning Strategy
- ADR-011: Rate Limiting Strategy
- And more...

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Submit a pull request

## License

MIT


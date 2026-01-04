# 🚀 Quick Start Guide - Product Recommendation Service

Get your recommendation service running in **5 minutes**!

---

## Prerequisites

- **Docker** & **Docker Compose** installed
- **Node.js 18+** installed (for seeding data)
- **8GB RAM** available

---

## Option 1: Automatic Setup (Recommended) ⚡

### One Command Setup

```bash
chmod +x scripts/quick-start.sh && ./scripts/quick-start.sh
```

This script will:
1. ✅ Stop any existing containers
2. ✅ Build Docker images
3. ✅ Start MongoDB + Redis
4. ✅ Seed sample data (500 products, 2000 orders)
5. ✅ Start API + Worker + Prometheus

**Total time**: ~2 minutes

---

## Option 2: Manual Setup (Step by Step) 🛠️

### Step 1: Start Infrastructure

```bash
docker-compose up -d mongodb redis
```

Wait 30 seconds for databases to initialize.

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Seed Sample Data

```bash
npx ts-node scripts/seed.ts
```

This creates:
- 500 products across 5 categories
- 2000 orders from 200 users
- Realistic purchase patterns

### Step 4: Start Application

```bash
docker-compose up -d api worker prometheus
```

Or run locally without Docker:

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker
npm run worker
```

---

## 🧪 Test Your Setup

### 1. Check Health

```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-03T..."
}
```

### 2. Get Recommendations

```bash
curl -H "x-api-key: admin-key-docker-123" \
  http://localhost:3000/v1/products/P0001/similar
```

**Expected response:**
```json
{
  "productId": "P0001",
  "recommendations": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 50,
    "hasMore": true
  }
}
```

**⚠️ Note:** If you get `503 Recommendations not available yet`:
- The batch job hasn't run yet
- Wait a few minutes for the scheduled job
- Or trigger manually (see Trigger Batch Job below)

### 3. View Metrics

```bash
curl http://localhost:3000/metrics
```

Or visit: http://localhost:9090 (Prometheus dashboard)

---

## 🔄 Trigger First Batch Job

The worker runs batch jobs on a schedule:
- **Collaborative**: Every hour
- **Association rules**: Daily at 3 AM

To trigger immediately (optional - for testing):

```bash
# This requires implementing a trigger endpoint
# For now, wait for the hourly collaborative job
# Or restart the worker to trigger on startup
docker-compose restart worker
```

---

## 📊 Access Services

| Service | URL | Notes |
|---------|-----|-------|
| **API** | http://localhost:3000 | Main API endpoints |
| **Health** | http://localhost:3000/health | Health check |
| **Metrics** | http://localhost:3000/metrics | Prometheus metrics |
| **Prometheus** | http://localhost:9090 | Metrics dashboard |
| **MongoDB** | localhost:27017 | Database (user: admin, pass: password123) |
| **Redis** | localhost:6379 | Cache |

---

## 🔑 API Authentication

**API Key for Testing:**
```
admin-key-docker-123
```

Include in header:
```bash
-H "x-api-key: admin-key-docker-123"
```

---

## 📖 API Examples

### Get Frequently Bought With Products

```bash
curl -H "x-api-key: admin-key-docker-123" \
  "http://localhost:3000/v1/products/P0001/frequently-bought-with?limit=10&offset=0"
```

### Get Frequently Bought Together

```bash
curl -H "x-api-key: admin-key-docker-123" \
  "http://localhost:3000/v1/products/P0001/frequently-bought-with?limit=10"
```

### Get Personalized Recommendations

```bash
curl -H "x-api-key: admin-key-docker-123" \
  "http://localhost:3000/v1/users/U0001/recommended?limit=20"
```

### Get Hybrid Recommendations

```bash
curl -H "x-api-key: admin-key-docker-123" \
  "http://localhost:3000/v1/products/P0001/recommendations?userId=U0001"
```

### Debug Endpoint (Admin Only)

```bash
curl -H "x-api-key: admin-key-docker-123" \
  "http://localhost:3000/debug/v1/recommendations/P0001?explain=true"
```

---

## 🐛 Troubleshooting

### Service won't start

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs api
docker-compose logs worker
docker-compose logs mongodb
docker-compose logs redis
```

### MongoDB connection error

```bash
# Restart MongoDB
docker-compose restart mongodb

# Check MongoDB is ready
docker exec -it recommendations-mongodb mongosh --eval "db.runCommand('ping')"
```

### Redis connection error

```bash
# Restart Redis
docker-compose restart redis

# Check Redis is ready
docker exec -it recommendations-redis redis-cli ping
```

### No recommendations returned (503)

**Cause:** Batch jobs haven't run yet.

**Solution:**
1. Check worker logs: `docker-compose logs worker`
2. Wait for hourly job
3. Or restart worker: `docker-compose restart worker`

### Port already in use

```bash
# Stop conflicting services
docker-compose down

# Check what's using the port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Change ports in docker-compose.yml if needed
```

---

## 🔄 Common Operations

### View Real-Time Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
```

### Restart Service

```bash
# Restart specific service
docker-compose restart api

# Restart all
docker-compose restart
```

### Stop All Services

```bash
docker-compose down
```

### Stop and Remove Data

```bash
# WARNING: This deletes all data!
docker-compose down -v
```

### Re-seed Data

```bash
npx ts-node scripts/seed.ts
docker-compose restart worker
```

---

## 📈 Monitoring

### View Prometheus Metrics

1. Open http://localhost:9090
2. Query examples:
   - `recommendations_api_requests_total` - Total requests
   - `recommendations_api_request_duration_seconds` - Latency
   - `recommendations_cache_hits_total` - Cache hits
   - `recommendations_quality_avg_score` - Recommendation quality

### Set Up Grafana (Optional)

Add to `docker-compose.yml`:

```yaml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  depends_on:
    - prometheus
```

---

## 🚀 Production Deployment

For production, see `DEPLOYMENT.md` for:
- Security hardening
- SSL/TLS setup
- Backup & disaster recovery
- Monitoring & alerting
- Scaling strategies

---

## 📝 Next Steps

1. ✅ **Service is running** - APIs are ready
2. 🧪 **Run tests** - `npm test`
3. 📊 **Check metrics** - http://localhost:9090
4. 🔧 **Customize** - Edit `.env` or `docker-compose.yml`
5. 📖 **Read docs** - `README.md` and `DEPLOYMENT.md`
6. 🚀 **Deploy** - Follow production guide in `DEPLOYMENT.md`

---

## 💡 Tips

- **Performance**: First requests may be slow (cold start)
- **Cache warming**: Takes ~2 minutes after batch job completes
- **Batch jobs**: Run on schedule, check worker logs for progress
- **Data**: Seeded data is random but realistic
- **Scale**: Adjust `BULLMQ_CONCURRENCY` for more workers

---

## 🆘 Get Help

- **Check logs**: `docker-compose logs -f`
- **Read docs**: See `README.md`, `DEPLOYMENT.md`, `TEST_REPORT.md`
- **Check health**: `curl http://localhost:3000/health`
- **Verify data**: Connect to MongoDB and check collections

---

## 🎉 Success!

If you see:
```json
{
  "status": "healthy",
  "timestamp": "..."
}
```

**Your recommendation service is working!** 🚀

Start making recommendations: `curl -H "x-api-key: admin-key-docker-123" http://localhost:3000/v1/products/P0001/similar`


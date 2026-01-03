# Deployment Guide

## Prerequisites

- MongoDB 6.0+ cluster (production-ready)
- Redis 7.0+ instance (with persistence enabled)
- Node.js 18+ runtime
- Reverse proxy (nginx/Caddy) for SSL termination
- Monitoring stack (Prometheus + Grafana)
- Log aggregation (optional: ELK/Loki)

## Infrastructure Setup

### MongoDB

1. **Provision MongoDB cluster** (3-node replica set recommended)
2. **Create database and user**:
```javascript
use recommendations
db.createUser({
  user: "rec_service",
  pwd: "secure_password",
  roles: [{ role: "readWrite", db: "recommendations" }]
})
```

3. **Connection string**:
```
mongodb://rec_service:secure_password@mongo1:27017,mongo2:27017,mongo3:27017/recommendations?replicaSet=rs0
```

### Redis

1. **Provision Redis instance** with persistence:
```bash
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

2. **Enable AOF persistence**:
```bash
appendonly yes
appendfsync everysec
```

### Application Servers

Recommended: 3+ application servers behind load balancer

**Server Specs (per instance)**:
- 4 vCPUs
- 8 GB RAM
- 50 GB disk

## Deployment Steps

### 1. Clone and Build

```bash
git clone <repository-url>
cd rocommendations
npm ci --production
npm run build
```

### 2. Configure Environment

Create production `.env` file:

```env
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# MongoDB
MONGODB_URI=mongodb://rec_service:password@mongo1:27017,mongo2:27017/recommendations?replicaSet=rs0
MONGODB_MAX_POOL_SIZE=100
MONGODB_MIN_POOL_SIZE=10

# Redis
REDIS_HOST=redis.production.local
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password
REDIS_DB=0
REDIS_MAX_MEMORY=2gb
REDIS_EVICTION_POLICY=allkeys-lru

# BullMQ
BULLMQ_CONCURRENCY=4
BULLMQ_MAX_JOBS_PER_WORKER=100

# Recommendation Settings
BATCH_SIZE=10000
PRE_COMPUTE_TOP_N=100
MIN_SCORE_THRESHOLD=0.3
DIVERSITY_THRESHOLD=0.6
MIN_ORDERS_PER_PRODUCT=3
CONFIDENCE_THRESHOLD=0.3

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_GLOBAL_MAX=10000

# API Keys
ADMIN_API_KEYS=admin-key-prod-1,admin-key-prod-2

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### 3. Start Services

#### Using systemd (Recommended)

**API Server** (`/etc/systemd/system/rec-api.service`):
```ini
[Unit]
Description=Recommendation Service API
After=network.target

[Service]
Type=simple
User=recuser
WorkingDirectory=/opt/rocommendations
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rec-api
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Worker** (`/etc/systemd/system/rec-worker.service`):
```ini
[Unit]
Description=Recommendation Service Worker
After=network.target

[Service]
Type=simple
User=recuser
WorkingDirectory=/opt/rocommendations
ExecStart=/usr/bin/node dist/worker.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rec-worker
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Start services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rec-api rec-worker
sudo systemctl start rec-api rec-worker
sudo systemctl status rec-api rec-worker
```

### 4. Configure Reverse Proxy

**Nginx** (`/etc/nginx/sites-available/recommendations`):
```nginx
upstream rec_backend {
    least_conn;
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;
}

server {
    listen 443 ssl http2;
    server_name api.recommendations.com;

    ssl_certificate /etc/letsencrypt/live/api.recommendations.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.recommendations.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://rec_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Metrics endpoint (internal only)
    location /metrics {
        allow 10.0.0.0/8;  # Internal network
        deny all;
        proxy_pass http://rec_backend;
    }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/recommendations /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Set Up Monitoring

#### Prometheus

**Configuration** (`prometheus.yml`):
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'recommendations'
    static_configs:
      - targets:
        - '10.0.1.10:3000'
        - '10.0.1.11:3000'
        - '10.0.1.12:3000'
    metrics_path: '/metrics'
```

#### Alerting Rules

**`alerts.yml`**:
```yaml
groups:
  - name: recommendations
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(recommendations_api_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High API error rate"

      - alert: LowRecommendationQuality
        expr: recommendations_quality_avg_score < 0.4
        for: 10m
        annotations:
          summary: "Recommendation quality below threshold"

      - alert: BatchJobFailed
        expr: increase(recommendations_batch_job_failures_total[1h]) > 2
        annotations:
          summary: "Batch jobs failing repeatedly"
```

### 6. Database Initialization

Run initial data migration (if needed):
```bash
# Import initial product catalog
mongoimport --uri="$MONGODB_URI" --collection=products --file=products.json

# Import historical orders
mongoimport --uri="$MONGODB_URI" --collection=orders --file=orders.json
```

Trigger initial batch jobs:
```bash
# Via admin API
curl -X POST -H "x-api-key: admin-key-prod-1" \
  http://localhost:3000/debug/v1/trigger-batch/content-based
```

## Health Checks

### Application Health
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Database Connectivity
```bash
# MongoDB
mongosh "$MONGODB_URI" --eval "db.runCommand({ ping: 1 })"

# Redis
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD ping
```

## Backup and Disaster Recovery

### MongoDB Backups

**Daily automated backups**:
```bash
#!/bin/bash
# /opt/scripts/backup-mongodb.sh

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/mongodb"

mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"
tar -czf "$BACKUP_DIR/recommendations-$DATE.tar.gz" "$BACKUP_DIR/$DATE"
rm -rf "$BACKUP_DIR/$DATE"

# Retain last 7 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

Add to cron:
```bash
0 1 * * * /opt/scripts/backup-mongodb.sh
```

### Redis Persistence

Redis automatically saves snapshots based on `save` directives in `redis.conf`. For critical data, enable AOF.

**Manual snapshot**:
```bash
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD BGSAVE
```

### Restore Procedure

**MongoDB**:
```bash
mongorestore --uri="$MONGODB_URI" --drop --gzip --archive=recommendations-20240101.tar.gz
```

**Redis**:
```bash
# Stop Redis
sudo systemctl stop redis

# Replace dump.rdb
sudo cp /backups/redis/dump.rdb /var/lib/redis/

# Start Redis
sudo systemctl start redis
```

## Rollback Procedure

### Application Rollback

1. **Stop services**:
```bash
sudo systemctl stop rec-api rec-worker
```

2. **Restore previous version**:
```bash
cd /opt/rocommendations
git checkout <previous-tag>
npm ci --production
npm run build
```

3. **Restart services**:
```bash
sudo systemctl start rec-api rec-worker
```

### Recommendation Version Rollback

Use admin API:
```bash
curl -X POST -H "x-api-key: admin-key-prod-1" \
  http://localhost:3000/debug/v1/rollback
```

## Scaling

### Horizontal Scaling

- **API Servers**: Add more instances behind load balancer
- **Workers**: Run multiple worker instances (BullMQ handles job distribution)

### Vertical Scaling

- **MongoDB**: Increase shard count for large datasets (10M+ products)
- **Redis**: Increase memory allocation or enable Redis Cluster

## Troubleshooting

### High API Latency

1. Check Redis cache hit rate:
```bash
curl http://localhost:3000/metrics | grep cache
```

2. Check MongoDB slow queries:
```javascript
db.system.profile.find().sort({millis: -1}).limit(5)
```

3. Scale Redis or add more API instances

### Batch Jobs Failing

1. Check worker logs:
```bash
sudo journalctl -u rec-worker -f
```

2. Check BullMQ dashboard or Redis queue:
```bash
redis-cli -h $REDIS_HOST LLEN "bull:recommendations:active"
```

3. Manually retry failed jobs via admin API

### Out of Memory (Redis)

1. Check current memory usage:
```bash
redis-cli -h $REDIS_HOST INFO memory
```

2. Increase `maxmemory` or trigger manual eviction:
```bash
redis-cli -h $REDIS_HOST CONFIG SET maxmemory 4gb
```

## Security Checklist

- [ ] API keys rotated and stored in secrets manager
- [ ] MongoDB authentication enabled with strong passwords
- [ ] Redis password protection enabled
- [ ] SSL/TLS enabled for all connections
- [ ] Firewall rules restrict access to internal services
- [ ] Rate limiting configured at nginx and app level
- [ ] Log aggregation captures all security events
- [ ] Regular security updates applied to dependencies

## Maintenance

### Weekly
- Review Prometheus alerts
- Check disk usage on all servers
- Review application logs for errors

### Monthly
- Update dependencies: `npm audit fix`
- Review and optimize slow queries
- Analyze recommendation quality metrics

### Quarterly
- Perform disaster recovery drill
- Review and update API keys
- Capacity planning based on growth trends

---

**Support**: For issues, contact DevOps team or open an issue in the repository.


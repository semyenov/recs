import { Counter, Histogram, Gauge, register } from 'prom-client';

// API Metrics
export const apiRequestsTotal = new Counter({
  name: 'recommendations_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'endpoint', 'status'],
});

export const apiRequestDuration = new Histogram({
  name: 'recommendations_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// Cache Metrics
export const cacheHitRate = new Counter({
  name: 'recommendations_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
});

export const cacheMissRate = new Counter({
  name: 'recommendations_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
});

// Batch Job Metrics
export const batchJobDuration = new Histogram({
  name: 'recommendations_batch_job_duration_seconds',
  help: 'Batch job duration in seconds',
  labelNames: ['job_type'],
  buckets: [60, 300, 600, 1800, 3600],
});

export const batchJobSuccess = new Counter({
  name: 'recommendations_batch_job_success_total',
  help: 'Total number of successful batch jobs',
  labelNames: ['job_type'],
});

export const batchJobFailures = new Counter({
  name: 'recommendations_batch_job_failures_total',
  help: 'Total number of failed batch jobs',
  labelNames: ['job_type'],
});

// Recommendation Quality Metrics
export const recommendationQualityScore = new Gauge({
  name: 'recommendations_quality_avg_score',
  help: 'Average recommendation score',
  labelNames: ['algorithm_type'],
});

export const recommendationCoverage = new Gauge({
  name: 'recommendations_coverage',
  help: 'Recommendation coverage (% of products with recs)',
  labelNames: ['algorithm_type'],
});

// System Metrics
export const activeConnections = new Gauge({
  name: 'recommendations_active_connections',
  help: 'Number of active connections',
  labelNames: ['connection_type'],
});

export function resetMetrics(): void {
  register.clear();
}

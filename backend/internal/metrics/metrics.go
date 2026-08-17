package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	RequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "shardleak_requests_total",
		Help: "Total rate-limit check requests received.",
	}, []string{"algorithm"})

	AllowedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "shardleak_allowed_total",
		Help: "Total rate-limit decisions that were allowed.",
	}, []string{"algorithm"})

	RejectedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "shardleak_rejected_total",
		Help: "Total rate-limit decisions that were rejected.",
	}, []string{"algorithm"})

	RequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "shardleak_request_duration_seconds",
		Help:    "Rate-limit check request duration in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"algorithm"})

	RedisErrorsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "shardleak_redis_errors_total",
		Help: "Total Redis errors encountered.",
	})

	DBErrorsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "shardleak_db_errors_total",
		Help: "Total PostgreSQL errors encountered.",
	})
)

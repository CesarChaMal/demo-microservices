// Command demo-go-service is the full-featured Go member of the demo
// microservices family: 32 microservice patterns mounted on a chi router,
// Eureka registration via plain REST (guide Step 4b) and graceful shutdown.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"demo-go-service/internal/eureka"
	"demo-go-service/patterns/architectural"
	"demo-go-service/patterns/caching"
	"demo-go-service/patterns/deployment"
	"demo-go-service/patterns/integration"
	"demo-go-service/patterns/messaging"
	"demo-go-service/patterns/monitoring"
	"demo-go-service/patterns/performance"
	"demo-go-service/patterns/resilience"
	"demo-go-service/patterns/security"
	"demo-go-service/patterns/transaction"
)

const (
	serviceName    = "go-service"
	serviceVersion = "1.0.0"
	defaultPort    = 5002
)

// pattern is the contract every pattern implementation satisfies.
type pattern interface {
	Name() string
	Category() string
	Description() string
	RegisterRoutes(r chi.Router)
}

func main() {
	port := defaultPort
	if v := os.Getenv("PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			port = n
		}
	}
	hostName := envOr("SERVICE_HOSTNAME", serviceName)
	serverURL := os.Getenv("EUREKA_SERVER_URL")

	// --- shared monitoring facilities (dogfooded by the service itself) ---
	healthRegistry := monitoring.NewHealthRegistry()
	metricsCollector := monitoring.NewMetricsCollector()

	// --- the 32 patterns, in the canonical order from the guide (Step 9) ---
	repo := integration.NewUserRepository()
	patterns := []pattern{
		resilience.NewCircuitBreaker(3, 5*time.Second),       // 1
		resilience.NewRetry(4, 10*time.Millisecond, 80*time.Millisecond), // 2
		resilience.NewBulkhead(3, 200*time.Millisecond),      // 3
		security.NewRateLimiter(5, time.Minute),              // 4
		caching.NewCacheAside(30 * time.Second),              // 5
		messaging.NewEventStore(),                            // 6
		architectural.NewCQRS(),                              // 7
		transaction.NewSaga(),                                // 8
		transaction.NewOutbox(2 * time.Second),               // 9
		repo,                                                  // 10 Repository
		integration.NewSpecificationPattern(repo),             // 11
		deployment.NewFeatureToggle(),                         // 12
		healthRegistry,                                        // 13 Health Check
		metricsCollector,                                      // 14 Metrics Collection
		performance.NewAsyncProcessor(4),                      // 15
		performance.NewReactiveStreams(16),                    // 16
		integration.NewAPIGateway(),                           // 17
		transaction.NewLockManager(),                          // 18
		transaction.NewIdempotencyStore(10 * time.Minute),     // 19
		caching.NewMaterializedView(),                         // 20
		caching.NewCacheWarming([]string{"user:1", "user:2", "user:3", "product:top10"}, 4), // 21
		deployment.NewBlueGreen(),                             // 22
		messaging.NewInbox(),                                  // 23
		integration.NewStranglerFig(),                         // 24
		resilience.NewTimeout(200 * time.Millisecond),         // 25
		caching.NewWriteBehindCache(2 * time.Second),          // 26
		integration.NewAntiCorruptionLayer(),                  // 27
		deployment.NewCanary(),                                // 28
		messaging.NewMessageProducer(64),                      // 29
		messaging.NewEventStreamProcessor(4),                  // 30
		security.NewTokenBucket(5, 1.0),                       // 31
		transaction.NewTwoPhaseCommit(),                       // 32
	}

	// --- router ---
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(requestMetrics(metricsCollector))

	// service contract endpoints (guide Step 4a). Key order matches the peer
	// convention: app/status/version/timestamp/patterns first, extras after.
	r.Get("/info", func(w http.ResponseWriter, req *http.Request) {
		patternSlugs := make([]string, 0, len(patterns))
		for _, p := range patterns {
			patternSlugs = append(patternSlugs, kebab(p.Name()))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"app":        serviceName,
			"status":     "running",
			"version":    serviceVersion,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
			"patterns":   patternSlugs,
			"language":   "Go",
			"port":       port,
			"categories": categoryCounts(patterns),
		})
	})

	r.Get("/health", func(w http.ResponseWriter, req *http.Request) {
		status, checks := healthRegistry.Run()
		httpStatus := http.StatusOK
		if status == "DOWN" {
			httpStatus = http.StatusServiceUnavailable
		}
		metricsCollector.IncrCounter("health_checks_total", 1)
		writeJSON(w, httpStatus, map[string]any{
			"status":    status,
			"service":   serviceName,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"uptime":    metricsCollector.Uptime(),
			"checks":    checks,
		})
	})

	r.Get("/metrics", func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service":        serviceName,
			"total_patterns": len(patterns),
			"categories":     categoryCounts(patterns),
			"patterns":       patternIndex(patterns),
			"metrics":        metricsCollector.Snapshot(),
			"uptime":         metricsCollector.Uptime(),
		})
	})

	// the shared processing contract: {"value":N} -> {"result":N*2}
	r.Post("/process", func(w http.ResponseWriter, req *http.Request) {
		var body struct {
			Value *float64 `json:"value"`
		}
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Value == nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Invalid input: value is required and must be a number",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"result": *body.Value * 2})
	})

	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service": serviceName,
			"endpoints": []string{
				"GET /info", "GET /health", "GET /metrics", "POST /process",
				"GET /api/patterns", "GET /api/patterns/{kebab-name}",
			},
		})
	})

	// pattern index + every pattern's own routes
	r.Get("/api/patterns", func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service":        serviceName,
			"total_patterns": len(patterns),
			"categories":     categoryCounts(patterns),
			"patterns":       patternIndex(patterns),
		})
	})
	for _, p := range patterns {
		p.RegisterRoutes(r)
	}

	srv := &http.Server{
		Addr:              ":" + strconv.Itoa(port),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// --- Eureka registration (guide Step 4b), retried while Eureka warms up ---
	eurekaClient := eureka.NewClient(eureka.Config{
		ServerURL:  serverURL,
		AppID:      "GO-SERVICE", // UPPERCASE, per the guide
		InstanceID: serviceName + ":" + serviceName + ":" + strconv.Itoa(port),
		HostName:   hostName,
		Port:       port,
	})
	go func() {
		for attempt := 1; attempt <= 3; attempt++ {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err := eurekaClient.Register(ctx)
			cancel()
			if err == nil {
				log.Printf("eureka: registered %s as %s", hostName, "GO-SERVICE")
				eurekaClient.StartHeartbeats(30 * time.Second)
				return
			}
			log.Printf("eureka: register attempt %d/3 failed: %v", attempt, err)
			time.Sleep(3 * time.Second)
		}
		log.Print("eureka: giving up on registration (server unreachable); running unregistered")
	}()

	// --- serve ---
	go func() {
		log.Printf("%s v%s listening on :%d with %d patterns", serviceName, serviceVersion, port, len(patterns))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// --- graceful shutdown: stop heartbeats, drain HTTP, stop workers, deregister ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit
	log.Print("shutdown signal received")

	eurekaClient.StopHeartbeats() // first, so no heartbeat races the deregister

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("http shutdown: %v", err)
	}

	for _, p := range patterns { // stop background workers (flushers, pools)
		if closer, ok := p.(interface{ Close() }); ok {
			closer.Close()
		}
	}

	deregCtx, deregCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer deregCancel()
	if err := eurekaClient.Deregister(deregCtx); err != nil {
		log.Printf("eureka: deregister failed: %v", err)
	} else {
		log.Print("eureka: deregistered")
	}
	log.Print("bye")
}

// --- helpers ---------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// requestMetrics counts every request and observes its duration.
func requestMetrics(collector *monitoring.MetricsCollector) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			started := time.Now()
			ww := middleware.NewWrapResponseWriter(w, req.ProtoMajor)
			next.ServeHTTP(ww, req)
			collector.IncrCounter("http_requests_total", 1)
			collector.IncrCounter("http_status_"+strconv.Itoa(ww.Status())+"_total", 1)
			collector.Observe("http_request_duration", time.Since(started))
		})
	}
}

// categoryCounts returns category -> number of patterns.
func categoryCounts(patterns []pattern) map[string]int {
	counts := map[string]int{}
	for _, p := range patterns {
		counts[p.Category()]++
	}
	return counts
}

// patternIndex describes every pattern with its uniform demo endpoint.
func patternIndex(patterns []pattern) []map[string]any {
	index := make([]map[string]any, 0, len(patterns))
	for _, p := range patterns {
		index = append(index, map[string]any{
			"name":        p.Name(),
			"category":    p.Category(),
			"description": p.Description(),
			"endpoint":    "/api/patterns/" + kebab(p.Name()),
		})
	}
	return index
}

// kebab converts a pattern name to its URL slug ("Token Bucket Rate
// Limiter" -> "token-bucket-rate-limiter").
func kebab(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-':
			b.WriteRune('-')
		}
	}
	return b.String()
}

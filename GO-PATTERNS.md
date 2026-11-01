# Go Service - Microservices Patterns Implementation

**Total Patterns: 32**

`demo-go-service` is the Go member of the demo-microservices family: the same
32 microservice patterns as the Java, Node and Python siblings, implemented in
Go 1.22 with the standard library plus a single dependency
(`go-chi/chi/v5`). Every pattern lives in `patterns/<category>/<file>.go`,
satisfies the `pattern` interface from `main.go`
(`Name/Category/Description/RegisterRoutes`), and mounts a uniform demo
endpoint at `GET /api/patterns/{kebab-name}` next to any peer-compatible
semantic alias. The service listens on port **5002** and registers with Eureka
as `GO-SERVICE`.

Conventions used below: all state is guarded by `sync.Mutex`/`sync.RWMutex`,
background work is goroutines driven by channels, `select` and `time.Ticker`,
and shutdown hooks implement `Close()` (swept by `main.go` on SIGTERM). Run it
with `docker-compose up --build go-service` or `go run .` from
`demo-go-service/`, then `curl http://localhost:5002/api/patterns` for the
live index.

## 1. Circuit Breaker Pattern

**Theory**: Prevents cascading failures by monitoring service calls and "opening" the circuit when failure rate exceeds threshold.

**Go implementation** (`patterns/resilience/circuitBreaker.go`): `CircuitBreaker` tracks failures behind a `sync.Mutex` with a `closed/open/half-open` state machine. After 3 consecutive failures (tuned in `main.go` via `NewCircuitBreaker(3, 5*time.Second)`) the breaker opens and every `Call` fails fast with the sentinel error `ErrCircuitOpen` instead of invoking the function. After a 5-second reset timeout the next call is allowed through as a half-open probe: success closes the circuit, failure re-opens it. Stats expose `failures`, `rejected` and `last_state_change`.

```go
cb := resilience.NewCircuitBreaker(3, 5*time.Second)
err := cb.Call(func() error { return callBackend() }) // ErrCircuitOpen while open
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/circuit-breaker
curl -X POST http://localhost:5002/process-with-circuit-breaker \
  -H "Content-Type: application/json" -d '{"fail":true}'
```

Three failing calls trip the breaker; subsequent calls (even with `"fail":false`)
get `503` until the 5-second reset window passes and a half-open probe succeeds.

## 2. Retry Pattern

**Theory**: Retries transient failures with exponential backoff so callers survive brief downstream hiccups.

**Go implementation** (`patterns/resilience/retry.go`): `Retry.Execute(fn func(attempt int) error)` runs up to 4 attempts (from `main.go`: `NewRetry(4, 10*time.Millisecond, 80*time.Millisecond)`), sleeping between them with a full-jitter exponential backoff — the delay doubles per attempt up to the 80 ms cap, and the actual sleep is `time.Duration(rand.Int63n(int64(delay)+1))` so retries don't stampede in lockstep. When every attempt fails, `Execute` returns `errors.Join(ErrRetriesExhausted, lastErr)` so callers can test for either.

```go
r := resilience.NewRetry(4, 10*time.Millisecond, 80*time.Millisecond)
err := r.Execute(func(attempt int) error { return flakyCall() })
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/retry
curl -X POST "http://localhost:5002/process-with-retry?failures=2"
```

`?failures=2` makes the wrapped function fail deterministically twice before
succeeding; the response shows every attempt, its backoff delay and the final
outcome.

## 3. Bulkhead Pattern

**Theory**: Isolates a resource behind a fixed-capacity pool so one slow dependency cannot consume every worker.

**Go implementation** (`patterns/resilience/bulkhead.go`): the classic Go counting semaphore — a buffered channel `semaphore chan struct{}` with capacity 3 (`NewBulkhead(3, 200*time.Millisecond)` from `main.go`). `Execute` first tries a non-blocking acquire (`select` with `default`), then blocks racing `<-time.After(maxWait)`; if the 200 ms queue budget expires first it returns `errBulkheadFull` instead of the slot. Release is `defer`red. Stats track `in_flight`, a `high_water` mark and `queue_waited` count.

```go
b := resilience.NewBulkhead(3, 200*time.Millisecond)
err := b.Execute(func() error { time.Sleep(150 * time.Millisecond); return nil })
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/bulkhead
curl -X POST "http://localhost:5002/process-with-bulkhead?hold_ms=150"
```

Capacity is 3; fire 5+ requests concurrently (e.g. a small `seq | xargs -P`
loop) and the ones that can't get a slot within 200 ms are rejected while
`in_flight` never exceeds 3.

## 4. Rate Limiting Pattern

**Theory**: Caps request rates per client to protect the service from abuse.

**Go implementation** (`patterns/security/rateLimiting.go`): a fixed-window limiter — `RateLimiter` keeps `hits map[string][]time.Time` (5 per minute, from `NewRateLimiter(5, time.Minute)` in `main.go`) behind a `sync.Mutex`. `Allow(key)` prunes timestamps older than the window using in-place slice filtering (`recent := rl.hits[key][:0]`, zero-alloc idiom) and admits the request only if the window has room.

```go
rl := security.NewRateLimiter(5, time.Minute)
if !rl.Allow(clientID) { /* 429 */ }
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/rate-limiting
for i in $(seq 1 7); do curl -s "http://localhost:5002/rate-limited?client=demo"; echo; done
```

Requests 1-5 pass, 6 and 7 get `429 rate limit exceeded`; change `?client=`
to get a fresh window per key.

## 5. Cache-Aside Pattern

**Theory**: Loads data lazily on demand and caches it, so the backing store is hit once per key, not once per request.

**Go implementation** (`patterns/caching/cacheAside.go`): `CacheAside` wraps `map[string]entry` (an `entry` holds `value any` plus an expiry deadline) in a `sync.RWMutex`. `Get(key, load func() any) any` takes the read lock on the hit path only; on a miss or expired entry it calls `load` (the simulated slow database) and backfills under the write lock. Entries live 30 seconds (`NewCacheAside(30*time.Second)` from `main.go`). Stats report hits, misses, evictions and `hit_ratio`.

```go
ca := caching.NewCacheAside(30 * time.Second)
v := ca.Get("user:42", func() any { return loadFromDB("user:42") })
```

**Try it**:

```bash
curl "http://localhost:5002/api/patterns/cache-aside?key=user:42"
curl "http://localhost:5002/api/patterns/cache-aside?key=user:42"
```

First call shows `db_loads: 1` (cache miss, loader ran); the immediate repeat
shows `db_loads: 0` and the hit ratio climbing.

## 6. Event Sourcing Pattern

**Theory**: Persists domain changes as an append-only event log instead of mutable state; current state is rebuilt by replaying events.

**Go implementation** (`patterns/messaging/eventSourcing.go`): `EventStore` keeps an append-only `log []domainEvent` (`Sequence`, `Aggregate`, `Type`, `Payload`, `Timestamp`) plus a `byID map[string][]int` index into it, both behind a `sync.RWMutex` — writes append and bump a monotonically increasing sequence, reads take the read lock. `Replay(aggregate)` folds the events in order (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`, `AccountClosed`) back into a `{balance, status}` state, which is exactly how the demo proves the log is the source of truth.

```go
es := messaging.NewEventStore()
es.Append("account-1", "MoneyDeposited", map[string]any{"amount": 150})
state := es.Replay("account-1")
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/event-sourcing
curl "http://localhost:5002/events?id=account-1"
```

The response pairs the raw event log for the seeded `account-1` aggregate with
the state obtained by replaying it.

## 7. CQRS Pattern

**Theory**: Separates the write model (commands) from a denormalized read model (queries) so each side can be shaped for its job.

**Go implementation** (`patterns/architectural/cqrs.go`): `CQRS` keeps a `writeLog []command` and a `reads map[string]readModel` projection under one `sync.RWMutex`. `Handle(cmdType, requestID, amount)` appends to the write log and projects into the read model — a 25 ms simulated `projectionLag` stands in for asynchronous projection. `Query(requestID)` serves the read model under `RLock` only, with per-side counters (`commands_handled`, `queries_served`).

```go
c := architectural.NewCQRS()
c.Handle("SubmitRequest", "req-1", 250)
rm, ok := c.Query("req-1")
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/cqrs
curl -X POST http://localhost:5002/query/req-1
```

The demo lazily submits `req-1` on first hit; `POST /query/{requestId}` reads
the projection (path parameter via `chi.URLParam`) and `404`s for unknown ids.

## 8. Saga Pattern

**Theory**: Runs a distributed transaction as a sequence of local transactions; a failed step triggers compensating actions in reverse order instead of a global lock.

**Go implementation** (`patterns/transaction/saga.go`): `Saga` holds four `sagaStep` values (`create-order`, `charge-payment`, `reserve-inventory`, `schedule-shipping`), each carrying its `Action` and its `Compensation`. `Run(failAt)` walks the steps forward; when step `failAt` fails, it walks backwards running each compensation, updating step status to `compensated` and appending to a trace log. The mutex-guarded `snapshot()` returns a defensive copy so handlers never serialize live state. A rolled-back saga responds `409`.

```go
s := transaction.NewSaga()
steps, log, outcome := s.Run(3) // fail step 3 → compensate steps 2, 1
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/saga
curl -X POST "http://localhost:5002/process-with-saga?fail_step=3"
```

Watch the log: steps 1-2 complete, step 3 fails, then `refund card` and
`DELETE order` run in reverse order.

## 9. Outbox Pattern

**Theory**: Writes outgoing messages in the same transaction as the data change, then a background relay publishes them — no dual-write inconsistency.

**Go implementation** (`patterns/transaction/outbox.go`): `Outbox` stores `outboxMessage` rows (`Topic`, `Payload`, `Published`...) behind a mutex; `Save(topic, payload)` only marks them pending. A background `loop()` goroutine (started by `NewOutbox(2*time.Second)`) wakes on a `time.Ticker` every 2 seconds and calls `Dispatch()` to publish pending rows. Shutdown is idiomatic: `Close()` uses `sync.Once` to close the `stop` channel, which the loop's `select` observes for one final dispatch before exiting — no message is lost on SIGTERM (and `main.go` sweeps `Close()` automatically).

```go
o := transaction.NewOutbox(2 * time.Second)
o.Save("orders", map[string]any{"id": "o-9", "total": 42})
published := o.Dispatch() // relay picks these up on the next tick
```

**Try it**:

```bash
curl -X POST http://localhost:5002/transaction/outbox \
  -H "Content-Type: application/json" -d '{"topic":"orders","payload":{"id":"o-9"}}'
sleep 2 && curl http://localhost:5002/api/patterns/outbox
```

The second call shows the row flipped to `published` by the ticker-driven
relay (no `sleep` yet = still pending).

## 10. Repository Pattern

**Theory**: Mediates between the domain and persistence with a collection-like interface, keeping the domain storage-agnostic.

**Go implementation** (`patterns/integration/repository.go`): `UserRepository` guards `rows map[int]user` with a `sync.Mutex` and exposes domain verbs only — `Save` (upsert semantics, allocates ids for `ID == 0`), `FindByID`, `FindByEmail` (a linear scan completely hidden behind the method), `All` (sorted with `sort.Slice`) and `Stats`. Callers never learn that the "database" is a map, so it could become SQL without touching them.

```go
repo := integration.NewUserRepository()
u, ok := repo.FindByID(1)      // Ada Lovelace, seeded
saved := repo.Save(user{Name: "Grace", Email: "grace@example.com"})
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/repository
curl -X POST http://localhost:5002/repository/save \
  -H "Content-Type: application/json" -d '{"name":"Grace Hopper","email":"grace@example.com"}'
```

`POST /repository/save` returns `201` with the saved aggregate (id assigned by
the repository) and updated counters.

## 11. Specification Pattern

**Theory**: Encapsulates business rules as composable predicates, so selection logic stays in the domain instead of leaking into query strings.

**Go implementation** (`patterns/integration/specification.go`): the spec is a named function type with fluent combinators — `Specification func(user) bool` with methods `And`, `Or` and `Not` returning new closures. Reusable atoms `NameContains(sub)` and `EmailDomain(domain)` (both case-insensitive) build up rules; `SpecificationPattern.Satisfying(spec)` evaluates the composed predicate over the shared `UserRepository` from pattern #10 and counts matches.

```go
spec := integration.NameContains("a").And(integration.EmailDomain("example.com"))
matches := sp.Satisfying(spec)
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/specification
curl "http://localhost:5002/api/patterns/specification?domain=example.com"
```

The response names the spec it evaluated —
`NameContains("a") AND EmailDomain("example.com")` — alongside the matching
users.

## 12. Feature Toggle Pattern

**Theory**: Turns behavior on/off at runtime without redeploying, with percentage rollouts and kill switches.

**Go implementation** (`patterns/deployment/featureToggle.go`): `FeatureToggle` stores named `toggle` records (`Enabled`, `Percentage`, `Hits`) under a mutex. `IsActive(name, userID)` requires the enabled flag *and* that the user falls inside the rollout: `bucketFor` hashes `name/userID` with FNV-1a into a stable 0-99 bucket, compared against the percentage — the same user always lands in the same bucket. `Set` upserts configuration at runtime; the toggle endpoint decodes `*bool`/`*int` pointers so omitted fields keep their current values.

```go
ft := deployment.NewFeatureToggle()
active, reason := ft.IsActive("new-checkout-flow", "user-42")
ft.Set("legacy-search", true, 100)
```

**Try it**:

```bash
curl "http://localhost:5002/api/patterns/feature-toggle?user=user-1"
curl http://localhost:5002/features
curl -X POST http://localhost:5002/features/dark-mode/toggle \
  -H "Content-Type: application/json" -d '{"enabled":false}'
```

`new-checkout-flow` sits at 50%, so different `?user=` values flip between
`enabled` and `outside-rollout`.

## 13. Health Check Pattern

**Theory**: Named probes roll up into one UP/DOWN status that orchestrators and service discovery can consume.

**Go implementation** (`patterns/monitoring/healthCheck.go`): `HealthRegistry` keeps `checks map[string]healthCheck` where `healthCheck` is a `func() error`. `Run()` copies the map under the lock (so probes can't race registration), executes each probe with `time.Now()`/`time.Since` latency measurement, and degrades the overall status to `DOWN` the moment any probe errors — the handler maps that to `503`. `main.go` doesn't just demo this pattern, it *uses* it: the service-level `/health` endpoint runs the same registry, which is what the compose healthcheck and Eureka report.

```go
hr := monitoring.NewHealthRegistry() // seeds the "self" probe
hr.RegisterCheck("db", func() error { return pingDB() })
status, results := hr.Run() // "UP" or "DOWN" + per-check latencies
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/health-check
curl http://localhost:5002/health
```

Both run the same probes; each result carries `name`, `status` and
`latency_ms`.

## 14. Metrics Collection Pattern

**Theory**: One collector receives counters, gauges and histograms from all subsystems and snapshots them on demand.

**Go implementation** (`patterns/monitoring/metricsCollection.go`): `MetricsCollector` keeps three mutex-guarded maps — `counters map[string]int64`, `gauges map[string]float64` and `histograms map[string][]float64` (bounded to the last 512 samples). `Snapshot()` copies each histogram, sorts it, and derives `count`/`sum`/`p50`/`p95`/`p99` with a small percentile helper. This collector is dogfooded service-wide: `main.go`'s `requestMetrics` middleware wraps every request, bumping `http_requests_total`, `http_status_{code}_total` and observing `http_request_duration`, and `/metrics` serves the snapshot.

```go
m := monitoring.NewMetricsCollector()
m.IncrCounter("orders_total", 1)
m.Observe("http_request_duration", 3*time.Millisecond)
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/metrics-collection
curl http://localhost:5002/metrics
```

Generate traffic on any endpoint first and the histogram percentiles in
`/metrics` move.

## 15. Async Processing Pattern

**Theory**: Offloads expensive work to a background pool and returns a task id immediately; the result is polled later.

**Go implementation** (`patterns/performance/asyncProcessing.go`): `AsyncProcessor` starts 4 worker goroutines (`NewAsyncProcessor(4)` from `main.go`), each looping on `select` over a stop channel and a `queue chan *task` (buffer 128) — a textbook Go worker pool. `Submit(id)` registers a `queued` task and hands it to the queue from a short-lived goroutine so the HTTP handler never blocks on a full buffer; workers simulate 50 ms of heavy work, then mark the shared task `completed` under the mutex. `Close()` is `sync.Once`-guarded and shuts the pool down on SIGTERM.

```go
ap := performance.NewAsyncProcessor(4)
ap.Submit("task-1")
t, ok := ap.Status("task-1") // queued → completed
```

**Try it**:

```bash
curl -X POST http://localhost:5002/async/submit \
  -H "Content-Type: application/json" -d '{"id":"report-1"}'
curl http://localhost:5002/async/status/report-1
```

The submit returns `202` instantly with the poll URL; ~50 ms later the status
endpoint shows `completed` plus pool stats (`workers`, `backlog`).

## 16. Reactive Streams Pattern

**Theory**: Processes items as they flow through the pipeline instead of batch-loading, with backpressure when the consumer can't keep up.

**Go implementation** (`patterns/performance/reactiveStreams.go`): the pipeline is publisher → buffered channel → subscriber. `ReactiveStreams` owns `buffer chan int` (capacity 16, from `NewReactiveStreams(16)` in `main.go`); a `subscribe()` goroutine started in the constructor ranges over the channel forever, transforming each value (doubling it) and keeping the last 64 items. `Publish(values ...int)` pushes with `select` + `default` — a non-blocking send, so when the buffer is full the item is *dropped and counted* rather than blocking the producer: backpressure made visible in the `dropped` stat.

```go
rs := performance.NewReactiveStreams(16)
accepted := rs.Publish(1, 2, 3, 4, 5, 6, 7, 8)
// subscribe() drains and transforms concurrently
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/reactive-streams
```

The demo publishes 8 values, sleeps 5 ms to let the subscriber drain, then
returns the recent transformed items plus `emitted`/`processed`/`dropped`/
`buffered` counters.

## 17. API Gateway Pattern

**Theory**: Single entry point that routes to backing services and applies cross-cutting concerns, so clients stay decoupled from the deployment layout.

**Go implementation** (`patterns/integration/apiGateway.go`): `APIGateway` holds a routing table of `upstream` records — `/java`, `/node`, `/python` pointing at the sibling services, with URLs overridable via `JAVA_SERVICE_URL`/`NODE_SERVICE_URL`/`PYTHON_SERVICE_URL` (compose hostnames by default). `Forward(path)` proxies `GET {upstream}/info` through an `http.Client{Timeout: 3s}` (the cross-cutting concern here: a hard timeout), reads the body through `io.LimitReader` (1 MB cap), and appends to a mutex-guarded request log capped at 50 entries. Unreachable upstreams return `502` and are counted as failures.

```go
gw := integration.NewAPIGateway()
payload, status, err := gw.Forward("/node")
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/api-gateway
curl -X POST http://localhost:5002/gateway/route \
  -H "Content-Type: application/json" -d '{"path":"/node"}'
```

With the compose stack up, the response embeds the Node service's `/info`
payload; without it you get a `502` and the failure lands in the log.

## 18. Distributed Lock Pattern

**Theory**: A lease-based mutex across processes: one owner holds a named lock until it expires or is released, preventing concurrent mutation.

**Go implementation** (`patterns/transaction/distributedLock.go`): `LockManager` keeps `lock` records (`owner`, `expires`, `acquired`) in a mutex-guarded map. `Acquire(name, owner, ttl)` grants the lock only if no live holder exists — expired leases are evicted on sight (TTL is the safety net against dead owners) — and `Release(name, owner)` refuses to unlock a lock owned by somebody else, which is what makes the lock correct rather than advisory-only.

```go
lm := transaction.NewLockManager()
ok := lm.Acquire("order-9", "worker-a", 30*time.Second)
denied := lm.Acquire("order-9", "worker-b", 10*time.Second) // false while held
lm.Release("order-9", "worker-a")
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/distributed-lock
curl "http://localhost:5002/api/patterns/distributed-lock?action=release"
```

The demo seeds `worker-a` holding the lock for 30 s and then has `worker-b`
try to grab it; `?action=release` frees it so the next call can acquire.

## 19. Idempotency Pattern

**Theory**: Repeating the same operation with the same key returns the original result instead of executing again — safe retries.

**Go implementation** (`patterns/transaction/idempotency.go`): `IdempotencyStore` (10-minute TTL from `main.go`) maps keys to `storedResult{Response, Created, Hits}`. `Execute(key, fn)` checks the map first: within the TTL it returns a copy of the stored response and bumps the `Hits`/`replayed` counters — the function never runs; past the TTL the entry is evicted and `fn` executes fresh. Copying the stored response before returning it keeps later mutations from rewriting history.

```go
ids := transaction.NewIdempotencyStore(10 * time.Minute)
res, replayed := ids.Execute("payment-1", func() map[string]any { return chargeCard() })
```

**Try it**:

```bash
curl "http://localhost:5002/api/patterns/idempotency?key=default-payment"
curl "http://localhost:5002/api/patterns/idempotency?key=default-payment"
```

Same key, two calls: the second response is flagged as a replay and the stats
show `first_time: 1, replayed: 1`.

## 20. Materialized View Pattern

**Theory**: Maintains a precomputed read model on write, so reads don't aggregate the full write model every time.

**Go implementation** (`patterns/caching/materializedView.go`): `MaterializedView` keeps the write model (`orders []order`) and the view (`byRegion map[string]float64`, region → total amount) under one `sync.RWMutex`. `Apply(order)` appends and calls `rebuild()` (recomputing totals, counting `source_rows_scanned`); `Totals()` takes only `RLock` and returns a copy of the map — constant work per read, no aggregation. Stats make the trade-off visible: every write costs a rebuild, every read costs nothing.

```go
mv := caching.NewMaterializedView() // seeds eu/us orders + builds view
mv.Apply(order{ID: "o-4", Region: "us", Amount: 50})
totals := mv.Totals() // map[eu:200 us:250]
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/materialized-view
```

Response lists per-region totals (sorted) plus `rebuilds`,
`source_rows_scanned` and `view_reads`.

## 21. Cache Warming Pattern

**Theory**: Preloads hot keys into the cache before traffic arrives, so early requests don't stampede the backing store.

**Go implementation** (`patterns/caching/cacheWarming.go`): `NewCacheWarming(hotKeys, workerCount)` runs the preload *in the constructor* — by the time `main.go` finishes wiring, the cache is already warm. The `warm()` helper fans out over a `work chan string` with `workerCount` goroutines coordinated by a `sync.WaitGroup` (a bounded parallel loader), each simulating a 5 ms backing-store read; `main.go` warms 4 hot keys (`user:1`, `user:2`, `user:3`, `product:top10`) with 4 workers. `Rewarm` re-runs the same pool on demand.

```go
cw := caching.NewCacheWarming([]string{"user:1", "user:2", "user:3", "product:top10"}, 4)
v, ok := cw.Get("user:1") // "warmed:user:1" — no loader ran
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/cache-warming
curl "http://localhost:5002/cache/warm?rewarm=true"
```

Stats show `warm_runs`, `loads` and `last_warm_ms`; `?rewarm=true` re-executes
the parallel preload.

## 22. Blue-Green Deployment Pattern

**Theory**: Two identical environments with traffic on only one; deploy to the idle side, verify, flip the router — near-zero downtime, instant rollback.

**Go implementation** (`patterns/deployment/blueGreen.go`): `BlueGreen` tracks `active` (`"blue"`/`"green"`), a `versions` map per environment (`blue: 1.0.0`, `green: 1.1.0-rc1`) and a switch counter, all mutex-guarded. `Switch()` is a one-line toggle between the two names — the entire "router flip" — and rollback is just switching back. The demo handler flips on `POST` (or `?switch=true`) and always reports which environment and version is serving.

```go
bg := deployment.NewBlueGreen() // blue active
bg.Switch() // traffic on green v1.1.0-rc1
bg.Switch() // and back — rollback
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/blue-green-deployment
curl -X POST http://localhost:5002/deployment/blue-green/switch
curl http://localhost:5002/deployment/blue-green
```

Each POST flips blue ↔ green; `switches` counts the releases.

## 23. Inbox Pattern

**Theory**: Records processed incoming message ids so redeliveries are recognized as duplicates and skipped exactly-once.

**Go implementation** (`patterns/messaging/inbox.go`): `Inbox` keeps `messages map[string]inboxMessage` plus an `order []string` that preserves arrival order for listing (Go maps don't iterate deterministically — the companion slice fixes that). `Receive(id, source, payload)` is the dedupe gate: the first delivery processes and stores the record; any redelivery of the same id returns `"duplicate"` without touching the payload. `Snapshot()` lists messages in arrival order.

```go
ib := messaging.NewInbox()
status1 := ib.Receive("msg-1", "orders", payload) // "processed"
status2 := ib.Receive("msg-1", "orders", payload) // "duplicate"
```

**Try it**:

```bash
curl -X POST "http://localhost:5002/inbox/message?id=msg-1" \
  -H "Content-Type: application/json" -d '{"source":"orders","payload":{"id":1}}'
curl "http://localhost:5002/api/patterns/inbox?id=msg-1"
```

Send the same `?id=` twice — the first response says `processed`, the second
`duplicate`, and the inbox snapshot shows the message once.

## 24. Strangler Fig Pattern

**Theory**: Migrates routes from a legacy system to its replacement one by one behind a facade, until the legacy system is unused.

**Go implementation** (`patterns/integration/stranglerFig.go`): `StranglerFig` starts with four routes (`/orders`, `/customers`, `/inventory`, `/reports`) all on `"legacy"` except `/orders`, pre-migrated to `"new"`. `Handle(route)` is the facade — it looks up the owning side, counts the hit and returns `"legacy"` or `"new"` (or `"unknown-route"`); `Migrate(route)` flips ownership without touching the others. Progress is measurable via `Stats()` (`migrated`/`routes`).

```go
sf := integration.NewStranglerFig()
sf.Handle("/orders")      // "new"
sf.Migrate("/customers")
sf.Handle("/customers")   // now "new"
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/strangler-fig
curl "http://localhost:5002/strangler/process?route=/customers&migrate=true"
```

The demo reports who served the requested route plus the full ownership table;
`?migrate=true` advances the migration.

## 25. Timeout Pattern

**Theory**: Bounds how long a call may take, so a slow dependency fails fast instead of pinning the caller.

**Go implementation** (`patterns/resilience/timeout.go`): the canonical Go timeout shape — `Execute(fn func(ctx context.Context) error)` builds a `context.WithTimeout` (200 ms budget from `main.go`), runs `fn` in its own goroutine writing to a buffered `done chan error` (buffered so the goroutine never leaks), and `select`s between `done` and `ctx.Done()`. When the budget expires the caller gets `context.DeadlineExceeded` immediately while the worker finishes on its own; the demo deliberately runs 300 ms of work against the 200 ms budget so the timeout always fires by default.

```go
t := resilience.NewTimeout(200 * time.Millisecond)
err := t.Execute(func(ctx context.Context) error {
    return slowCall(ctx) // interrupted at the deadline
})
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/timeout
curl "http://localhost:5002/api/patterns/timeout?work_ms=100"
```

Default (`work_ms=300`) times out at 200 ms; `?work_ms=100` finishes inside
the budget and completes.

## 26. Write-Behind Cache Pattern

**Theory**: Acknowledges writes immediately and persists them in background batches — trading a small durability window for latency.

**Go implementation** (`patterns/caching/writeBehind.go`): `WriteBehindCache` pairs a read cache with a `pending []pendingWrite` queue. `Set` updates the cache, appends to pending and returns instantly (the ack); the queue is bounded at 1024 entries and drops the oldest write if the "database" stalls, keeping memory flat. A background `loop()` goroutine (started by `NewWriteBehindCache(2*time.Second)`) flushes on a `time.Ticker`; `flush` swaps the pending slice out under the lock, then simulates the 10 ms batched database write. `Close()` (a `sync.Once` around the stop channel) triggers one final `flush("shutdown")` so queued writes survive SIGTERM.

```go
wb := caching.NewWriteBehindCache(2 * time.Second)
wb.Set("counter", 42)     // acked instantly, persisted within 2s
v, _ := wb.Get("counter") // 42 — freshest value, maybe not yet durable
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/write-behind-cache
curl "http://localhost:5002/api/patterns/write-behind-cache?key=session-9"
```

Response acknowledges immediately and shows `pending_writes` draining into
`flushed_writes` on the next 2-second tick.

## 27. Anti-Corruption Layer Pattern

**Theory**: A translating facade converts a foreign/legacy contract into the domain model, so external quirks never leak inward.

**Go implementation** (`patterns/integration/antiCorruptionLayer.go`): `AntiCorruptionLayer.Translate` maps a `legacyCustomer` (cryptic `custNo`, one flat `fullName`, class codes `"P"/"G"/"S"`, epoch-millis `epochMs`) into a clean `modernCustomer` (`ID`, `FirstName`/`LastName` split, `Tier` as a word, RFC3339 `CreatedISO`). Records it cannot translate — single-token names, unknown class codes — are *rejected* with the typed error `errUntranslatable` (a string-based `aclError` type implementing `error`) rather than half-translated, and the handler surfaces that as `422`. Translation counters distinguish `translated` from `rejected`.

```go
acl := integration.NewAntiCorruptionLayer()
modern, err := acl.Translate(legacyCustomer{
    CustNo: "0001234", FullName: "Grace Hopper", CustCls: "P", EpochMs: 1735689600000,
})
// modern = {ID: "cust-1234", FirstName: "Grace", LastName: "Hopper", Tier: "platinum", ...}
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/anti-corruption-layer
curl "http://localhost:5002/api/patterns/anti-corruption-layer?class=X"
```

The default record translates cleanly; `?class=X` (unknown code) is rejected
with `422` and increments the `rejected` counter.

## 28. Canary Deployment Pattern

**Theory**: Routes a small, growing slice of traffic to the new version and rolls back automatically when its error rate crosses a threshold.

**Go implementation** (`patterns/deployment/canary.go`): `Canary` starts at 10% with a 5% error threshold (`NewCanary()`). `Route()` assigns each request via a counter split — if sending this request to canary would keep the canary share at or below the target percentage, it goes canary, otherwise stable — so the split tracks the configured percentage without randomness. `RecordError()` increments the canary error count and, once `canaryErrors/canaryHits > threshold`, snaps `percentage` to 0 and sets `autoRolledBack`: the automated rollback. `SetPercentage` clamps to 0-100.

```go
c := deployment.NewCanary()
served := c.Route()           // "canary" or "stable"
rolledBack := c.RecordError() // true once error rate > 5%
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/canary-deployment
curl "http://localhost:5002/deployment/canary?percentage=50"
curl "http://localhost:5002/deployment/canary?error=true"
```

Widen the slice with `?percentage=`, then force errors — after enough
`?error=true` hits, `auto_rolled_back` flips and all traffic returns to
stable.

## 29. Message Producer Pattern

**Theory**: Publishes messages to a topic through a bounded buffer; when the buffer is full the producer is told immediately (backpressure) instead of blocking or unboundedly buffering.

**Go implementation** (`patterns/messaging/messageProducer.go`): `MessageProducer` (64-slot buffer, from `NewMessageProducer(64)` in `main.go`) publishes through a non-blocking `select` — `case messages <- m:` on success, `default:` when the buffer is full, in which case `Publish` returns `false` and the drop is counted. That `select`/`default` pair is the whole backpressure story: the producer learns about congestion synchronously. `Consume()` drains one message from the buffer, simulating the subscriber side.

```go
mp := messaging.NewMessageProducer(64)
ok := mp.Publish("orders", "o-1", map[string]any{"total": 42}) // false when buffer full
msg := mp.Consume()
```

**Try it**:

```bash
curl "http://localhost:5002/api/patterns/message-producer?key=o-1"
```

Each call publishes one message and reports the published/dropped/consumed
tallies plus the buffer fill level.

## 30. Event Stream Processor Pattern

**Theory**: Consumes an unbounded event stream with partition-parallel workers that commit offsets per partition — Kafka-style semantics in miniature.

**Go implementation** (`patterns/messaging/eventStreamProcessor.go`): `EventStreamProcessor` owns a `source` channel (256 buffer) and 4 worker goroutines (`NewEventStreamProcessor(4)` from `main.go`), each looping on `select` over a stop channel and the source — the same worker-pool shape as #15, applied to a stream. `Emit(id, offset)` assigns a partition with a rune-hash of the id modulo 4 (keyed routing: same id → same partition). Workers do ~2 ms of simulated processing per record, then commit `offsets map[int]int` for their partition, so the demo tracks committed offsets, per-record latency and the average. `Close()` is `sync.Once`-guarded.

```go
esp := messaging.NewEventStreamProcessor(4)
esp.Emit("order-1", 1) // hashed to one of 4 partitions
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/event-stream-processor
```

The demo emits a burst, gives the workers a moment, and reports per-partition
committed offsets, processed count and average latency.

## 31. Token Bucket Rate Limiter Pattern

**Theory**: A bucket of refillable tokens — bursts up to the bucket size pass instantly, sustained traffic is capped at the refill rate.

**Go implementation** (`patterns/security/tokenBucket.go`): `TokenBucket` (capacity 5, refill 1 token/second, from `NewTokenBucket(5, 1.0)` in `main.go`) uses lazy refill — no timers. `Take()` adds `elapsed.Seconds() * refill` tokens since the last call, caps the bucket at capacity, then charges one token if available; if `tokens < 1` the request is denied and counted. Because refill is computed on read, the whole limiter is one mutex-guarded struct with zero background work — a common Go alternative to scheduled refill.

```go
tb := security.NewTokenBucket(5, 1.0)
ok := tb.Take() // bursts of 5, then 1/s sustained
```

**Try it**:

```bash
for i in $(seq 1 7); do curl -s http://localhost:5002/api/patterns/token-bucket-rate-limiter; echo; done
```

The first ~5 instant requests pass; the 6th gets `429 no tokens available`
and the stats show the fractional token count refilling at 1/s.

## 32. Two-Phase Commit Pattern

**Theory**: A coordinator first asks every participant to vote (prepare), then broadcasts a global commit or rollback — atomicity across all of them.

**Go implementation** (`patterns/transaction/twoPhaseCommit.go`): `TwoPhaseCommit.Commit(participantNames, failAt)` runs against the trio `orders-db`, `inventory-db`, `payments-db`. Phase 1 asks each participant to vote — a vote against returns the sentinel `ErrVoteRejected`; phase 2 broadcasts `commit` if every vote passed, otherwise `rollback` to all prepared participants. Every step appends to a trace log (vote → prepare → global decision), the handler maps an aborted run to `409`, and participant records show their final `Prepared`/`Committed` state.

```go
tpc := transaction.NewTwoPhaseCommit()
participants, trace, err := tpc.Commit([]string{"orders-db", "inventory-db", "payments-db"}, 0)
```

**Try it**:

```bash
curl http://localhost:5002/api/patterns/two-phase-commit
curl -X POST "http://localhost:5002/transaction/2pc?fail_participant=2"
```

With no failures all three commit; `?fail_participant=2` makes `inventory-db`
vote NO and the trace shows the global rollback.

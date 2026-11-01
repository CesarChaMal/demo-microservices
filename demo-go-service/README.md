# demo-go-service

Full-featured Go member of the demo-microservices family: one service,
**32 microservice patterns** mounted on a [chi](https://github.com/go-chi/chi)
router, Eureka registration via plain REST, and a distroless container image.
It speaks the same service contract as its siblings (Java :8080,
Node :3000, Python :5001) on port **5002**.

- **Language**: Go 1.22, standard library + one dependency (`go-chi/chi/v5`)
- **Port**: 5002
- **Eureka app id**: `GO-SERVICE` (registered over raw REST, see
  `internal/eureka/eureka.go`)

## Service contract

| Endpoint | Method | Description |
|---|---|---|
| `/info` | GET | Peer-contract metadata: `app`, `status`, `version`, `timestamp`, `patterns` (slug list) — plus Go extras `language`, `port`, `categories` |
| `/health` | GET | Aggregated health: `{"status":"UP",...}` (`503` when DOWN) |
| `/metrics` | GET | Pattern census (per-category counts, total 32) + request metrics |
| `/process` | POST | `{"value":10}` → `{"result":20}` |
| `/api/patterns` | GET | Index of all 32 patterns with their demo endpoints |
| `/api/patterns/{kebab-name}` | GET | Uniform demo endpoint for each pattern |
| `/` | GET | Quick link listing |

Every pattern also mounts any peer-compatible semantic alias it has
(`POST /process-with-circuit-breaker`, `GET /events`, `POST /transaction/2pc`,
`POST /gateway/route`, `GET /features`, `POST /async/submit`, ...), mirroring
the routes the Java/Node/Python services expose.

## The 32 patterns

| Category | Count | Patterns |
|---|---|---|
| resilience | 4 | Circuit Breaker, Retry, Bulkhead, Timeout |
| caching | 4 | Cache-Aside, Write-Behind Cache, Materialized View, Cache Warming |
| messaging | 4 | Event Sourcing, Inbox, Message Producer, Event Stream Processor |
| transaction | 5 | Two-Phase Commit, Distributed Lock, Idempotency, Outbox, Saga |
| architectural | 1 | CQRS |
| integration | 5 | Repository, Specification, API Gateway, Anti-Corruption Layer, Strangler Fig |
| deployment | 3 | Feature Toggle, Canary Deployment, Blue-Green Deployment |
| performance | 2 | Async Processing, Reactive Streams |
| monitoring | 2 | Health Check, Metrics Collection |
| security | 2 | Rate Limiting, Token Bucket Rate Limiter |
| **total** | **32** | |

Each pattern lives in `patterns/<category>/<pattern>.go` (standard library
only) and exposes a constructor, `Name()/Category()/Description()`, and
`RegisterRoutes(chi.Router)`.

## Running

### Docker Compose (recommended)

```bash
docker-compose up --build go-service
curl http://localhost:5002/info
```

The image is multi-stage (`golang:1.22-alpine` →
`gcr.io/distroless/static-debian12:nonroot`); the compose healthcheck execs
the bundled `/app/healthcheck` probe because distroless has no curl.

### Local

```bash
cd demo-go-service
go mod tidy   # creates go.sum (not committed)
go run .
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` | Eureka registration URL |
| `PORT` | `5002` | Listen port |
| `SERVICE_HOSTNAME` | `go-service` | Hostname advertised to Eureka (compose hostname) |
| `JAVA_SERVICE_URL` / `NODE_SERVICE_URL` / `PYTHON_SERVICE_URL` | `http://java-service:8080` etc. | Upstreams used by the API Gateway pattern |

## Layout

```
demo-go-service/
├── main.go                     # router, contract endpoints, Eureka wiring, shutdown
├── go.mod                      # module demo-go-service; single dep: chi
├── Dockerfile                  # multi-stage, distroless, nonroot
├── internal/
│   ├── eureka/eureka.go        # Step 4b REST client (register/heartbeat/deregister/query)
│   └── healthcheck/main.go     # tiny probe binary for the compose healthcheck
└── patterns/<category>/*.go    # 32 pattern implementations, one file each
```

On SIGTERM/SIGINT the service stops Eureka heartbeats, drains in-flight HTTP
requests, shuts down background workers (write-behind flusher, outbox relay,
worker pools), and deregisters from Eureka before exiting.

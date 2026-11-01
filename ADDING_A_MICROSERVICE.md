# Adding a Microservice — demo-microservices

> The step-by-step guide for adding a new microservice to this repo — any language, any of the
> three service families. Modeled on the sibling repo's `ADDING_A_MICROFRONTEND.md`.
>
> **Guard rule:** if your change touches any registration point in this guide (service table,
> port table, peer wiring, pattern lists, file checklist), update this guide **in the same commit**.

---

## 0. How the system fits together

### The three families

| Family | Directory pattern | What it contains | Examples |
|---|---|---|---|
| **Full** | `demo-<lang>-service` | The full contract + all 32 design patterns + Eureka registration + peer wiring | `demo-java-service`, `demo-node-service`, `demo-python-service` |
| **Simple** | `demo-simple-<lang>-service` | Contract only (`/info`, `/process`) + Eureka registration — the minimal "hello world" tier | `demo-simple-java-service`, `demo-simple-node-service`, `demo-simple-python-service` |
| **Lambda** | `demo-lambda-<lang>-service` | Handler-only packaging for AWS Lambda, deployed via `infra/serverless` | `demo-lambda-java-service`, `demo-lambda-node-service`, `demo-lambda-python-service` |

`demo-eureka-server` is the Netflix Eureka discovery server everything registers with
(`demo-simple-eureka-server` also exists as an alternate/minimal server with a full Spring Boot layout).

### Port table (authoritative)

| Port | Service | Status |
|---|---|---|
| 8761 | `demo-eureka-server` | in use |
| 8080 | `demo-java-service` | in use |
| 3000 | `demo-node-service` | in use |
| 5001 | `demo-python-service` | in use |
| 3306 | MySQL (`mysql:8.0`) | in use |
| 8081 | `demo-gateway-service` (API gateway) | reserved |
| 5002 | `demo-go-service` | reserved |
| 5003 | `demo-dotnet-service` | reserved |
| 6379 | Redis | reserved |
| 5672 / 15672 | RabbitMQ (amqp / management UI) | reserved |

Taking a reserved port? Update this table in the same commit.

### The service contract

Every service — every family, every language — implements:

| Endpoint | Behavior |
|---|---|
| `GET /info` | Service metadata (name, language, version, pattern count) |
| `GET /health` | Liveness. Java uses Spring Actuator: `GET /actuator/health` |
| `GET /metrics` | Pattern/metrics summary (full family) |
| `POST /process` `{"value": <number>}` | **The interop contract:** returns `{"result": value * 2}` |

`POST /process` is the one endpoint peers call through — Feign from Java, direct HTTP from
Node/Python. `value * 2` must hold across every implementation or the demo's cross-service
narrative breaks.

### Who talks to whom (as built today)

- **Java** discovers peers via **Eureka + Spring Cloud OpenFeign**
  (`demo-java-service/.../client/NodeServiceClient.java`), wrapped in resilience4j
  `@CircuitBreaker` / `@Retry`.
- **Node and Python call peers by Docker Compose hostname directly**
  (`http://java-service:8080`, `http://python-service:5001`) — Node via the registry in
  `demo-node-service/patterns/integration/apiGateway.js`, Python via the URL constants in
  `ExternalServiceClient` (`demo-python-service/patterns/resilience/circuit_breaker.py`).

> **Known limitation:** Node/Python don't use Eureka *discovery* — they hardcode compose
> hostnames. Works on `micro_net`, breaks outside Docker. A later change moves them to real
> discovery (`getInstancesByAppId` / `py_eureka_client` discovery) and rewrites Step 7 of this
> guide in the same PR. Until then, **follow the existing convention** (direct hostnames) so
> the demo stays internally consistent.

### Deployment modes — honest status

| Mode | Command | Status |
|---|---|---|
| Docker Compose | `./run.sh docker` | ✅ primary; fully working |
| Local processes | `./run.sh local` | ✅ working (needs JDK 21/11, Node 20/18, Python 3.11/3.13 + Docker for MySQL) |
| AWS legacy stack | `./run.sh aws` | ❌ broken (root `infra/` Terraform is quarantined; EKS path replaces it) |
| AWS Lambda | `./run.sh lambda` | ⚠️ see Step 8 — handler strings must match the code files |

---

## 1. Pre-flight checklist

Answer these before writing code:

- [ ] **Directory name** — follows the family pattern (`demo-<lang>-service`, `demo-simple-<lang>-service`, or `demo-lambda-<lang>-service`)
- [ ] **Family** — full (32 patterns) or simple (contract only)?
- [ ] **Port** — taken from the reserved list in §0; not one in use
- [ ] **Base image** — pinned tag (e.g. `node:20-alpine`, `python:3.11-slim`, `golang:1.22-alpine`), never `latest`
- [ ] **Eureka client for your language?**

| Language | Eureka client | → Use |
|---|---|---|
| Java / Spring Boot | Spring Cloud Netflix Eureka (built in) | **Step 4a** |
| Node.js | `eureka-js-client` | **Step 4a** |
| Python | `py_eureka_client` | **Step 4a** |
| .NET | Steeltoe Eureka | **Step 4a** |
| Go / Rust / anything else | none maintained | **Step 4b** (plain REST) |

---

## 2. The steps

### Step 1 — Scaffold the directory

```
demo-<lang>-service/
├── Dockerfile          # mandatory, all families
├── README.md           # mandatory, all families
├── info.txt            # mandatory, all families — one-paragraph summary
└── <language source>   # per family (see below)
```

Full family mirrors the layout of an existing full service (patterns separated into
`patterns/<category>/` modules — see Step 9 for the 10 categories). Simple family mirrors
`demo-simple-node-service` (single entry file is fine). Lambda family mirrors
`demo-lambda-node-service` (handler + packaging notes).

### Step 2 — Implement the contract

All four endpoints from §0, `POST /process` returning `value * 2` exactly. Copy the response
*shape* from an existing service in another language — the demo's point is that the JSON is
interchangeable.

### Step 3 — Write the Dockerfile

- Multi-stage when the toolchain allows (build stage → slim runtime; `golang:*-alpine` →
  distroless is the best case; `node:*-alpine` and `python:*-slim` single-stage are fine).
- Pin the base image tag.
- The image must contain `curl` or `wget` **if** you use the compose healthcheck from Step 5
  (distroless images don't — use a different probe there, e.g. a `/health`-checking exec).
- WSL2 note: builds reading the context from `/mnt/f` (9p filesystem) are slow. That's
  environmental — let the build finish or retry it; don't change the Dockerfile to chase it.

### Step 4 — Register with Eureka

**Critical:** every service must set the Eureka host via an env var in its compose block.
The existing services disagree on the env var name — don't inherit that confusion:

| Service | Env var actually read | Default when unset |
|---|---|---|
| `demo-java-service` | `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` (Spring relaxed binding) | yml default `http://eureka-server:8761/eureka/` (container hostname — breaks bare-local) |
| `demo-node-service` | `EUREKA_SERVER_HOST` | `localhost` (breaks in Docker) |
| `demo-simple-node-service` | `EUREKA_HOST` | `eureka-server` |
| `demo-python-service` | — hardcoded `http://eureka-server:8761/eureka/` | (breaks bare-local) |

#### 4a — With a client library

Reference implementations to copy from:

- **Java:** `demo-java-service/src/main/resources/application.yml` — `eureka.client.*` block.
  The compose file passes `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE=${EUREKA_SERVER_URL}`.
- **Node:** `demo-node-service/app.js` (~line 830) — `eureka-js-client` instance config.
  Set `EUREKA_SERVER_HOST=eureka-server` in your compose block.
- **Python:** `demo-python-service/app.py` `register_with_eureka()` (~line 1367) — `py_eureka_client`.
  Prefer an env-var override over the existing hardcode.

#### 4b — Without a client (Go, Rust, …) — plain REST against the Eureka API

Eureka is just HTTP. Spring's server serves these endpoints (some docs use the AWS-era
`/eureka/v2/...` prefix; on this server it's `/eureka/...`):

| Operation | Call |
|---|---|
| Register | `POST /eureka/apps/{APPID}` with an instance document |
| Heartbeat | `PUT /eureka/apps/{appId}/{instanceId}` **every 30 s** |
| Deregister | `DELETE /eureka/apps/{appId}/{instanceId}` on shutdown |
| Query | `GET /eureka/apps` (list) or `GET /eureka/apps/{appId}` |

Rules: `APPID` is **UPPERCASE** (`GO-SERVICE`); send `Content-Type: application/json` and
`Accept: application/json`; if `healthCheckUrl` is unreachable from the Eureka container, the
instance is marked DOWN — put the compose hostname in URLs, not `localhost`.

Instance document:

```json
{
  "instance": {
    "instanceId": "go-service:go-service:5002",
    "hostName": "go-service",
    "app": "GO-SERVICE",
    "ipAddr": "go-service",
    "status": "UP",
    "port": { "$": 5002, "enabled": true },
    "dataCenterInfo": {
      "@class": "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
      "name": "MyOwn"
    },
    "leaseInfo": { "durationInSecs": 30 },
    "homePageUrl": "http://go-service:5002/",
    "statusPageUrl": "http://go-service:5002/health",
    "healthCheckUrl": "http://go-service:5002/health",
    "vipAddress": "go-service",
    "secureVipAddress": "go-service"
  }
}
```

Minimal Go shape (a real implementation lands in `demo-go-service/internal/eureka/`):

```go
type Instance struct {
    Instance struct {
        InstanceID    string `json:"instanceId"`
        HostName      string `json:"hostName"`
        App           string `json:"app"`
        IPAddr        string `json:"ipAddr"`
        Status        string `json:"status"`
        Port          struct {
            Dollar  int  `json:"$"`
            Enabled bool `json:"enabled"`
        } `json:"port"`
        DataCenterInfo struct {
            Class string `json:"@class"`
            Name  string `json:"name"`
        } `json:"dataCenterInfo"`
        LeaseInfo struct {
            DurationInSecs int `json:"durationInSecs"`
        } `json:"leaseInfo"`
        HomePageURL    string `json:"homePageUrl"`
        StatusPageURL  string `json:"statusPageUrl"`
        HealthCheckURL string `json:"healthCheckUrl"`
        VipAddress     string `json:"vipAddress"`
        SecureVipAddress string `json:"secureVipAddress"`
    } `json:"instance"`
}

// Register → POST, Heartbeat → ticker every 30s → PUT, Deregister (defer) → DELETE.
// Query peers with GET /eureka/apps/{APPID} and read instance.port.$ + instance.hostName.
```

### Step 5 — Add the docker-compose block

`docker-compose.yml`. **The service key is the hostname peers will call** (`http://go-service:5002`).

```yaml
  go-service:
    build: ./demo-go-service
    container_name: go-service
    ports:
      - "5002:5002"
    environment:
      - EUREKA_SERVER_URL=${EUREKA_SERVER_URL}
      - EUREKA_SERVER_HOST=eureka-server   # ← your language's var from the Step 4 table
    networks:
      - micro_net
    depends_on:
      eureka-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:5002/health"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s
    restart: unless-stopped
```

The timing values mirror the existing Java/Eureka blocks, which probe their Actuator endpoint:
`["CMD-SHELL", "curl -fsS http://localhost:<port>/actuator/health | grep '"status":"UP"' >/dev/null"]`.
Probe **your own contract endpoint** instead (`/health` for non-actuator services — the
`["CMD", "curl", "-fsS", …]` form above). Node/Python currently ship no compose healthcheck at
all, so your block sets the example.

### Step 6 — `.env` / `.env.security` entries

`.env.security` is committed (placeholder values); `.env` is its local copy and **never
committed**. Add an entry when your service introduces a new dependency URL — use the compose
hostname, and comment the bare-local alternative (see the existing `REDIS_URL` lines for the
pattern).

### Step 7 — Wire peer calls (full family only — this is the coupled core)

A new service isn't part of the demo until the existing ones can reach it:

**Java (required):** in `demo-java-service/src/main/java/com/example/java_service/client/`,
copy `NodeServiceClient.java` + `NodeServiceClientFallback.java` and rename for your
service — keeping the shape:

```java
@FeignClient(name = "go-service", fallback = GoServiceClientFallback.class,
             configuration = FeignConfiguration.class)
public interface GoServiceClient {
    @PostMapping("/process")
    @CircuitBreaker(name = "go-service")   // resilience4j instance must exist (below)
    @Retry(name = "go-service")
    ProcessResponse process(...);
}
```

Then add a matching resilience4j instance block named `go-service` in
`demo-java-service/src/main/resources/application.yml` (copy the `node-service` block —
circuit-breaker + retry + timeout settings). `FeignConfiguration.class` already exists in the
same package — reuse it.

**Node (required):** in `demo-node-service/app.js` — add your URL constant next to the
existing peer constants; add a health indicator alongside the existing ones (~lines 156–157);
register the route in `demo-node-service/patterns/integration/apiGateway.js`
`serviceRegistry` (`'go-service': 'http://go-service:5002'`).

**Python (required):** add your URL constant to `ExternalServiceClient` in
`demo-python-service/patterns/resilience/circuit_breaker.py`, next to the existing
`http://java-service:8080/calculate` / `http://node-service:3000/process` constants — that is
where Python's peer calls actually live. (`app.py` only delegates to `ExternalServiceClient`;
its `check_external_services()` health entry is a simulated stub that makes no real call.)

**Simple/Lambda families:** skip this step — they don't participate in peer calls.

### Step 8 — Optional: AWS Lambda variant

`infra/serverless/lambda_api.tf` maps each lambda to a route. **The #1 Lambda failure in this
repo's history: the Terraform `handler` string not matching the actual file/symbol.** The
handler string is `file-name-without-extension.exported-symbol` (Java: fully-qualified class
plus `::method`):

| Service | Handler file | Correct handler string |
|---|---|---|
| Java | `demo-lambda-java-service/src/main/java/com/example/java_service/lambda/StreamLambdaHandler.java` | `com.example.lambda.StreamLambdaHandler::handleRequest` |
| Node | `demo-lambda-node-service/handler.js` (`exports.handler`) | `handler.handler` |
| Python | `demo-lambda-python-service/lambda_function.py` (`lambda_handler`) | `lambda_function.lambda_handler` |

Verify the string against the file before every `terraform apply` — and read the file's
`package` line, not just its path: the Java handler sits under
`src/main/java/com/example/java_service/lambda/` but declares `package com.example.lambda;`, so
the handler string follows the **package** (`com.example.lambda.…`), not the directory. Lambda is
the small-scale compute option; the primary AWS path is EKS (`infra/eks/` — see `infra/README.md`).

### Step 9 — Update the docs (registration points — guard rule applies)

- `CLAUDE.md` — service table row, pattern count, any new infra
- `README.md` — service list row + mention in the quick-start table
- **`<LANG>-PATTERNS.md`** (full family) — same 32 canonical headings as the other services:

  > Circuit Breaker · Retry · Bulkhead · Rate Limiting · Cache-Aside · Event Sourcing · CQRS ·
  > Saga · Outbox · Repository · Specification · Feature Toggle · Health Check · Metrics
  > Collection · Async Processing · Reactive Streams · API Gateway · Distributed Lock ·
  > Idempotency · Materialized View · Cache Warming · Blue-Green Deployment · Inbox ·
  > Strangler Fig · Timeout · Write-Behind Cache · Anti-Corruption Layer · Canary Deployment ·
  > Message Producer · Event Stream Processor · Token Bucket Rate Limiter · Two-Phase Commit

  (Known drift: `JAVA-PATTERNS.md` currently titles #16 "Reactive Programming Pattern" while
  Node/Python say "Reactive Streams Pattern" — rename the Java heading to match when you touch
  that file; a new service uses "Reactive Streams".)

  Written as `## <n>. <Name>` headings in this order, files under `patterns/<category>/` using
  the ten categories: resilience, caching, messaging, transaction, architectural, integration,
  deployment, performance, monitoring, security. `pattern-gap-analysis.sh` diffs against this
  list (the script is being realigned to it — until then, diff manually).

### Step 10 — Verify

```bash
docker compose config -q                                   # compose parses
docker compose up --build -d <your-service> eureka-server
curl http://localhost:5002/info
curl -X POST http://localhost:5002/process -H 'Content-Type: application/json' -d '{"value":21}'
#   → {"result":42}
curl http://localhost:5002/health && curl http://localhost:5002/metrics
```

- Eureka console `http://localhost:8761` shows `GO-SERVICE` within ~30 s (heartbeat interval)
- Peer round-trip: call the Java Feign route that targets your service → returns your `result`
- Lambda variant: zip exists in `infra/serverless/artifacts/` and handler string matches (Step 8)

### Step 11 — File checklist

| # | Change | New/existing | Mandatory |
|---|---|---|---|
| 1 | `demo-<lang>-service/` (Dockerfile, README.md, info.txt, source) | new | ✅ all families |
| 2 | `docker-compose.yml` service block | existing | ✅ all families |
| 3 | `.env.security` (+ local `.env`) entry | existing | if new URLs |
| 4 | Java: `<Service>Client.java` + fallback + resilience4j instance | existing | full ✅ |
| 5 | Node: URL constant + health indicator + `apiGateway.js` registry | existing | full ✅ |
| 6 | Python: URL constant in `patterns/resilience/circuit_breaker.py` | existing | full ✅ |
| 7 | `CLAUDE.md` + `README.md` tables | existing | ✅ all families |
| 8 | `<LANG>-PATTERNS.md` (32 headings) | new | full ✅ |
| 9 | `infra/serverless/lambda_api.tf` (+ zip artifact) | existing | lambda only |

Commit on a `feature/...` branch, present tense ("Add go service with 32 patterns"), never
`.env`, never `successful_repos.txt`.

---

## 3. Gotchas

- **Compose hostnames only resolve inside `micro_net`.** `eureka-server`, `java-service`,
  `mysql`, … are Docker DNS names. Running a service bare on the host means switching every
  URL to `localhost` — which is exactly why each service's Eureka/DB URLs are env-driven.
- **Three different Eureka env names** (`EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` vs
  `EUREKA_SERVER_HOST` vs `EUREKA_HOST`) — see the Step 4 table. Always set yours explicitly.
- **Java ignores `REDIS_URL`.** `demo-java-service` hardcodes `spring.redis.host: localhost` —
  Redis env is consumed by Node/Python only (until Java is wired).
- **Java falls back to H2** unless `SPRING_DATASOURCE_URL` is set — your MySQL is silently
  not-MySQL if that env is missing.
- **TF handler ≠ filename is the #1 Lambda failure** (Step 8 table).
- **JWT demo fallback:** services accept a hardcoded demo secret when `JWT_SECRET` is unset —
  fine for the demo, never production.
- **Eureka appId casing:** register `GO-SERVICE` (upper), query case-sensitively per the docs,
  and keep `hostName`/URLs as compose names so health checks pass.
- **Healthcheck needs curl/wget in the image** — distroless images need an exec-based probe.
- **WSL2/9p slowness:** builds and `terraform` on `/mnt/f` are slow; on provider-download
  timeouts **re-run**, don't destroy and recreate.

---

*Author: Cesar Francisco Chavez Maldonado — part of [demo-microservices](https://github.com/CesarChaMal/demo-microservices).*

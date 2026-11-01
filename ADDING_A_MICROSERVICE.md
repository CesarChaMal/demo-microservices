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
| **Full** | `demo-<lang>-service` | The full contract + all 32 design patterns + Eureka registration + peer wiring | `demo-java-service`, `demo-node-service`, `demo-python-service`, `demo-go-service` |
| **Simple** | `demo-simple-<lang>-service` | Contract only (`/info`, `/process`) + Eureka registration — the minimal "hello world" tier | `demo-simple-java-service`, `demo-simple-node-service`, `demo-simple-python-service`, `demo-simple-go-service` |
| **Contract-first** | `demo-<lang>-service` | The contract (`/info`, `/process`, `/health`) + Eureka registration via a **real client** — no pattern catalog yet; the seed tier a new language starts from before growing to Full | `demo-dotnet-service` |
| **Lambda** | `demo-lambda-<lang>-service` | Handler-only packaging for AWS Lambda, deployed via `infra/serverless` | `demo-lambda-java-service`, `demo-lambda-node-service`, `demo-lambda-python-service` |

`demo-eureka-server` is the Netflix Eureka discovery server everything registers with
(`demo-simple-eureka-server` also exists as an alternate/minimal server with a full Spring Boot layout).

`demo-gateway-service` is the API gateway in front of them all — Spring Cloud Gateway on
port 8081 routing `/java/**`, `/node/**`, `/python/**`, `/go/**` to `lb://<APPID>` (StripPrefix=1).
Like the Eureka server it's core infrastructure, not a pattern-catalog service: no 32-pattern
checklist, no Step 7 peer wiring — adding a service behind it is one route block in its
`application.yml`.

### Port table (authoritative)

| Port | Service | Status |
|---|---|---|
| 8761 | `demo-eureka-server` | in use |
| 8080 | `demo-java-service` | in use |
| 3000 | `demo-node-service` | in use |
| 5001 | `demo-python-service` | in use |
| 3306 | MySQL (`mysql:8.0`) | in use |
| 8081 | `demo-gateway-service` (API gateway) | in use |
| 5002 | `demo-go-service` | in use |
| 5003 | `demo-dotnet-service` | in use |
| 6379 | Redis (`redis:7-alpine`) | in use |
| 5672 / 15672 | RabbitMQ (`rabbitmq:3.13-management`, amqp / management UI) | in use |

Taking a reserved port? Update this table in the same commit. Simple-family services aren't
listed — they're not wired into docker-compose and only occupy a port when run bare (typically
the full service's port, with the full service stopped).

### The service contract

Every service — every family, every language — implements the two contract endpoints; the full
family implements all four:

| Endpoint | Behavior |
|---|---|
| `GET /info` | Service metadata — exact shapes pinned in Step 2 (full and simple differ) |
| `POST /process` `{"value": <number>}` | **The interop contract:** returns `{"result": value * 2}` |
| `GET /health` | Liveness (full family; simple family only if it registers a `healthCheckUrl` — Step 4b). Java uses Spring Actuator: `GET /actuator/health` |
| `GET /metrics` | Pattern/metrics summary (full family) |

`POST /process` is the one endpoint peers call through — Feign from Java, direct HTTP from
Node/Python. `value * 2` must hold across every implementation or the demo's cross-service
narrative breaks.

### Who talks to whom (as built today)

- **Java** discovers peers via **Eureka + Spring Cloud OpenFeign**
  (`demo-java-service/.../client/NodeServiceClient.java`, `GoServiceClient.java`,
  `DotNetServiceClient.java`), wrapped in resilience4j `@CircuitBreaker` / `@Retry`, invoked
  from `EnterpriseController`.
- **Node and Python resolve peers Eureka-first, compose-hostname fallback**
  (`http://java-service:8080`, `http://python-service:5001`, `http://go-service:5002` are the
  *fallbacks*, not the only answer). Each has a tiny resolver module —
  `demo-node-service/discovery.js` (`peerUrl(appId, fallbackUrl)`, backed by
  eureka-js-client's local registry cache) and `demo-python-service/discovery.py`
  (`peer_url(app_id, fallback_url)`, plain Eureka REST + 10s TTL cache). URL resolution
  happens at **call time**, so a peer's live instance address (pod IP on EKS, container IP in
  compose) is used when the registry knows it. Asymmetry to copy: Java is called at its
  `/calculate` route (its API-gateway pattern), everyone else at `/process`.

### Deployment modes — honest status

| Mode | Command | Status |
|---|---|---|
| Docker Compose | `./run.sh docker` | ✅ primary; fully working |
| Local processes | `./run.sh local` | ✅ working (needs JDK 22/11, Node 22/18, Python 3.11/3.13 + Docker for MySQL) |
| AWS legacy stack | `./run.sh aws` | ❌ deprecated — fails fast with a pointer (root `infra/` Terraform is quarantined; replaced by the EKS path) |
| AWS EKS | `MODE=eks ./create_stack.sh` | ✅ primary AWS path — Fargate + one ECR repo per service; see Step 8b |
| AWS Lambda | `./run.sh lambda` | ⚠️ see Step 8a — handler strings must match the code files; zips are built automatically first |

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

The endpoints your family owes (§0), `POST /process` returning `value * 2` exactly. Copy the
response *shape* from an existing service in another language — the demo's point is that the
JSON is interchangeable. `/info` shapes (from `demo-go-service/main.go` and
`demo-simple-go-service/main.go`):

```json
// full family
{"app": "go-service", "status": "running", "version": "1.0.0",
 "timestamp": "2026-01-01T00:00:00Z", "patterns": ["circuit-breaker", "retry", "…"]}
// simple family — {"app", "status"} only
{"app": "go-service", "status": "running"}
```

`patterns` is the ordered kebab-case slug list (same order as your `<LANG>-PATTERNS.md`);
extra keys beyond these are fine — java/node/python each add a few.

### Step 3 — Write the Dockerfile

- Multi-stage when the toolchain allows (build stage → slim runtime; `golang:*-alpine` →
  distroless is the best case; `node:*-alpine` and `python:*-slim` single-stage are fine).
- Pin the base image tag.
- **Maven images must build AND use the jar inside the image** — `RUN ./mvnw package
  -DskipTests && mv target/*.jar app.jar`. A `COPY target/*.jar` instead copies a jar from
  the build context, which only exists if you built on the host first; on a fresh checkout
  (exactly what CI gets) that image build fails.
- **Commit `.mvn/wrapper/maven-wrapper.properties` with the service.** The wrapper runs in
  `only-script` mode: the script downloads Maven using the `distributionUrl` from that file,
  so if it's gitignored `./mvnw` fails on a fresh checkout — the same class of bug as the
  host-jar `COPY` above. (This repo's root `.gitignore` once carried a template `.mvn` rule
  that did exactly that; it's removed and replaced with an explanatory note.) Verify with
  `git ls-files <service>/.mvn/` — it must list the properties file.
- The image must contain `curl` or `wget` **if** you use the HTTP compose healthcheck from
  Step 5. Distroless images ship neither — compile a tiny probe binary and exec it instead
  (`demo-go-service/internal/healthcheck/main.go` → compose `test: ["CMD", "/app/healthcheck"]`).
  Python slim images ship neither either — probe with the stdlib
  (`demo-python-service`: `test: ["CMD", "python", "-c", "import urllib.request;…"]`).
- Go multi-stage: copy the **full source before `go mod tidy`** — intra-module imports
  (`patterns/*`, `internal/*`) must resolve or tidy strips your router from `go.mod`. The
  alternative is committing `go.sum` and using `go mod download`. Rationale comment lives in
  `demo-go-service/Dockerfile`.
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
| `demo-python-service` | `EUREKA_SERVER_URL` (same var as go — registration *and* peer lookup in `discovery.py` both read it) | `http://eureka-server:8761/eureka/` (container hostname — override to `http://localhost:8761/eureka/` for bare-local) |
| `demo-go-service` | `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` |

#### 4a — With a client library

Reference implementations to copy from:

- **Java:** `demo-java-service/src/main/resources/application.yml` — `eureka.client.*` block.
  The compose file passes `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE=${EUREKA_SERVER_URL}`.
- **Node:** `demo-node-service/app.js` (~line 838, `new Eureka({...})`) — `eureka-js-client`
  instance config. Set `EUREKA_SERVER_HOST=eureka-server` in your compose block.
- **Python:** `demo-python-service/app.py` `register_with_eureka()` (~line 1367) — `py_eureka_client`,
  server URL taken from `discovery.py`'s `EUREKA_BASE` (i.e. `EUREKA_SERVER_URL`, go's var —
  one override retargets registration *and* peer lookup).

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
instance is marked DOWN — put the compose hostname in URLs, not `localhost`. Two conventions
the Go services establish:

- **Shutdown order:** stop the heartbeat loop **first**, then `DELETE` the registration —
  otherwise a heartbeat can race the deregister and re-create the lease. See
  `demo-go-service/main.go` (`StopHeartbeats()` runs before `Deregister()`).
- **Simple family registers the same APPID as the full service** — `demo-simple-go-service`
  also registers `GO-SERVICE` — and serves `/health` (one endpoint beyond the simple
  contract) because its `healthCheckUrl` must answer or Eureka marks it DOWN.

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
      # pass the env var(s) YOUR service reads (Step 4 table) — typically just one
      - EUREKA_SERVER_URL=${EUREKA_SERVER_URL}
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
`["CMD", "curl", "-fsS", …]` form above). Distroless runtimes have no shell/curl: exec a
compiled probe instead — `test: ["CMD", "/app/healthcheck"]`, built from
`demo-go-service/internal/healthcheck/main.go`. The two non-actuator peers show both
HTTP forms: node-service curls `/health` (any 2xx passes — `/health` returns 200 for
`DEGRADED`, matching the EKS probes), and python-service — on a slim image with no
curl — probes the same URL with a stdlib `urllib` one-liner. Grep for `"status":"UP"`
only if your endpoint is Actuator-style, where a substring means healthy.

### Step 6 — `.env` / `.env.security` entries

`.env.security` is committed (placeholder values); `.env` is its local copy and **never
committed**. Add an entry when your service introduces a new dependency URL — use the compose
hostname, and comment the bare-local alternative (see the existing `REDIS_URL` lines for the
pattern).

### Step 7 — Wire peer calls (full family only — this is the coupled core)

A new service isn't part of the demo until the existing ones can reach it:

**Java (required):** in `demo-java-service/src/main/java/com/example/java_service/client/`,
copy `NodeServiceClient.java` + `NodeServiceClientFallback.java` (or the smaller
`GoServiceClient.java` pair) and rename for your service — keeping the shape:

```java
@FeignClient(name = "go-service", fallback = GoServiceClientFallback.class,
             configuration = FeignConfiguration.class)
public interface GoServiceClient {
    @PostMapping("/process")
    @CircuitBreaker(name = "go-service")   // resilience4j instance must exist (below)
    @Retry(name = "go-service")
    Map<String, Object> process(@RequestBody Map<String, Object> request);

    @GetMapping("/info")                    // peer metadata is part of the wiring
    Map<String, Object> getInfo();
}
```

Real clients return `Map<String, Object>` (no per-peer DTO), declare `GET /info` alongside
`POST /process`, and the fallback implements both. Then:

1. Add a matching resilience4j instance block named `<your-service>` in
   `demo-java-service/src/main/resources/application.yml` — copy the existing `go-service`
   or `node-service` block (circuit-breaker + retry + timeout + bulkhead instances).
   `FeignConfiguration.class` already exists in the same package — reuse it.
2. **Wire it into a call site** — the interface alone does nothing. Add the client to
   `EnterpriseController`'s constructor and call it from a route (see the
   `goResult`/`goInfo` entries there).

**Node (required):** three registration points. URLs resolve Eureka-first via
`demo-node-service/discovery.js` — `peerUrl(appId, fallbackUrl)` returns the registry's live
instance URL (first `UP` instance, `ipAddr` before `hostName`) or your fallback, so the
compose/k8s name you write is what's used when Eureka has nothing:

1. Health indicator in `demo-node-service/app.js` (~lines 156–158, the
   `ExternalServiceHealthIndicator` rows) — pass a **resolver closure**, not a string:
   `() => peerUrl('GO-SERVICE', 'http://go-service:5002')` — plus a
   `healthService.addCheck('<your-service>', …)` entry (~lines 163–165).
2. Gateway registry in `demo-node-service/patterns/integration/apiGateway.js`
   `serviceRegistry` (`'go-service': 'http://go-service:5002'`) — `forwardRequest` wraps the
   entry in `peerUrl(route.targetService.toUpperCase(), …)` for you.
3. If Node should call you under a circuit breaker, the outbound `axios.post` lives in
   `demo-node-service/patterns/resilience/circuitBreaker.js` — template it:
   `` `${peerUrl('GO-SERVICE', 'http://go-service:5002')}/process` ``.

**Python (required):** two registration points, both resolved through
`demo-python-service/discovery.py` — `peer_url(app_id, fallback_url)` hits the Eureka REST
API (`GET /eureka/apps/<APP_ID>`, 10s TTL cache) and falls back to your compose/k8s name:

1. `ExternalServiceClient` in `demo-python-service/patterns/resilience/circuit_breaker.py` —
   add a `call_<your>_service()` method next to `call_go_service()`
   (`peer_url('GO-SERVICE', 'http://go-service:5002') + '/process'`). Note the asymmetry:
   Java is called at `/calculate` (its API-gateway pattern route), Node/Go at `/process`.
2. The gateway registry in `demo-python-service/patterns/integration/api_gateway.py`
   `service_registry` (`'go-service': 'http://go-service:5002'`) — `_forward_request` wraps
   the entry in `peer_url(route.target_service.upper(), …)` for you.

(`app.py` only delegates to `ExternalServiceClient`; its `check_external_services()` health
entry resolves each peer through `peer_url` — no HTTP call, so it can't fail the health
check, it reports the resolvable addresses.)

**Simple/Lambda families:** skip this step — they don't participate in peer calls.

### Step 8 — Optional: AWS variants (Lambda or EKS)

#### 8a — Lambda (small-scale compute)

`infra/serverless/lambda_api.tf` maps each lambda to a route. **The #1 Lambda failure in this
repo's history: the Terraform `handler` string not matching the actual file/symbol.** The
handler string is `file-name-without-extension.exported-symbol` (Java: fully-qualified class
plus `::method`):

| Service | Handler file | Correct handler string |
|---|---|---|
| Java | `demo-lambda-java-service/src/main/java/com/example/java_service/lambda/StreamLambdaHandler.java` | `com.example.java_service.lambda.StreamLambdaHandler::handleRequest` |
| Node | `demo-lambda-node-service/handler.js` (`exports.handler`) | `handler.handler` |
| Python | `demo-lambda-python-service/lambda_function.py` (`lambda_handler`) | `lambda_function.lambda_handler` |

Verify the string against the file before every `terraform apply` — and read the file's
`package` line, not just its path: for Java the handler is `package.Class::method`, and the
`package` declaration must match the directory layout
(`com/example/java_service/lambda/` ⇒ `package com.example.java_service.lambda;`). This repo
historically shipped sources at `com/example/java_service/…` declaring `package com.example.lambda`
— a layout/package mismatch that made the handler string silently wrong. Lambda is the
small-scale compute option; the primary AWS path is EKS — 8b below (see `infra/README.md`
for the compute-decision table).

#### 8b — EKS (the primary AWS path)

Every service that ships a Dockerfile runs on the Fargate cluster. A new service registers
in **four** places (guard rule applies — all in the same commit):

1. **ECR repo** — add `"demo-<svc>"` to `local.service_repos` in `infra/eks/main.tf`.
   Terraform creates one immutable repo per entry; the comment there says to keep the list
   in sync with `infra/eks/k8s/*.yaml` and the CI docker-build matrix.
2. **k8s manifest** — copy the shape of `infra/eks/k8s/dotnet-service.yaml` (the seed
   shape: Deployment + ClusterIP Service, image
   `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/demo-<svc>:${TAG}`). Keep the
   k8s Service **name equal to the compose service name** — that is what makes the
   in-code Eureka/peer defaults resolve identically in-cluster. The gateway stays the
   only LoadBalancer; new services sit behind it as ClusterIP.
   `scripts/render-k8s.sh` globs `infra/eks/k8s/*.yaml`, so a new manifest file is picked
   up automatically — no script edit.
3. **Deploy pipeline** — add `<svc>-service` to the `for SVC in eureka-server
   gateway-service java-service …` loop in `.github/workflows/deploy.yml` (it builds and
   pushes `sha-<short>` + `latest`, then applies the rendered manifests).
4. **CI** — `.github/workflows/ci.yml`: add the dir to the docker-build matrix, and bump
   the k8s-manifests job's kind assertions (`Deployment == 7`, `Service == 7`,
   `HPA == 5` — a new manifest changes the counts; CI fails loudly if you forget, by
   design). If the service should autoscale, copy the HPA block from
   `java-service.yaml` (autoscaling/v2, CPU 70%, 1–4) and bump the HPA count too.

mysql/redis/rabbitmq have **no** k8s manifests, by design — in-cluster the services degrade
honestly (java→H2, node/python→cache degrade, go→in-process buffer). A new service that
depends on them follows the same honest-degradation rule; document its fallback in its
manifest's comments.

### Step 9 — Update the docs (registration points — guard rule applies)

- `CLAUDE.md` — service table row, pattern count, any new infra
- `README.md` — service table row + Service-URLs line (+ simplified-services note if simple)
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
  deployment, performance, monitoring, security. `pattern-gap-analysis.sh` diffs the
  implementation files against this list — run it, it must exit 0 (32/32 per language).

  Pattern-exposure convention: **java and Go** expose a per-pattern route under
  `/api/patterns/<name>` — Go as `GET` routes in `demo-go-service/main.go`, java as `POST`
  routes in `PatternsController.java`. **Node and Python** expose the same patterns under
  idiomatic semantic paths instead (`POST /inbox/message`, `POST /cache/warm`,
  `POST /messaging/produce`, …) — either convention satisfies this step.

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
- Lambda variant: zip exists in `infra/serverless/artifacts/` and handler string matches (Step 8a)
- EKS variant: `AWS_ACCOUNT_ID=000000000000 AWS_REGION=us-east-1 TAG=test ./scripts/render-k8s.sh`
  renders your manifest with no `${` placeholders left — CI's k8s-manifests job does exactly
  this on every push (Step 8b)

### Step 11 — File checklist

| # | Change | New/existing | Mandatory |
|---|---|---|---|
| 1 | `demo-<lang>-service/` (Dockerfile, README.md, info.txt, source) | new | ✅ all families |
| 2 | `docker-compose.yml` service block | existing | ✅ full family (simple/lambda aren't composed) |
| 3 | `.env.security` (+ local `.env`) entry | existing | if new URLs |
| 4 | Java: `<Service>Client.java` + fallback + resilience4j instance | existing | full ✅ |
| 5 | Node: `peerUrl()` fallback entry + health indicator + `apiGateway.js` registry | existing | full ✅ |
| 6 | Python: `peer_url()` fallback in `patterns/resilience/circuit_breaker.py` | existing | full ✅ |
| 7 | `CLAUDE.md` + `README.md` tables | existing | ✅ all families |
| 8 | `<LANG>-PATTERNS.md` (32 headings) | new | full ✅ |
| 9 | `infra/serverless/lambda_api.tf` (+ zip artifact) | existing | lambda only |
| 10 | EKS: `infra/eks/main.tf` `service_repos` + `infra/eks/k8s/<svc>.yaml` + deploy.yml `SVC` loop + ci.yml matrix/counts | existing | if it ships a Dockerfile |

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

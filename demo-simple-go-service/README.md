# Simple Go Microservice

Minimal Go microservice from the **simple** service family: the service contract only
(`/info`, `/process`, `/health`) plus Eureka registration — no design patterns. It is the
Go counterpart of `demo-simple-node-service` and `demo-simple-python-service`, and the
minimal sibling of `demo-go-service`.

## Features

* `POST /process` doubles the numeric input — the cross-service interop contract.
* `GET /info` returns basic metadata; `GET /health` returns liveness.
* Registers with Eureka via plain REST calls (no maintained Go Eureka client exists):
  register → heartbeat every 30 s → deregister on shutdown.
* Dockerized with a multi-stage build (`golang:1.22-alpine` → distroless static, non-root).

## Prerequisites

* Go 1.22+ (standard library only — no dependencies to download)
* Eureka server running at `http://eureka-server:8761/eureka/`

## Project Structure

```
.
├── go.mod        # Module definition (stdlib only, no third-party dependencies)
├── main.go       # HTTP handlers + minimal Eureka REST client
├── Dockerfile    # Multi-stage container build
├── README.md
└── info.txt
```

## Endpoints

### POST `/process`

Accepts a JSON payload with a numeric `value` and returns its double.

```
curl -X POST http://localhost:5002/process \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'
```

Response:

```json
{ "result": 20 }
```

### GET `/info`

Returns basic service information.

```
curl http://localhost:5002/info
```

Response:

```json
{ "app": "go-service", "status": "running" }
```

### GET `/health`

Returns liveness status.

```json
{ "status": "UP" }
```

## Running the Service

### Locally

```
go run main.go
```

Outside Docker, point the client at the local Eureka server:

```
EUREKA_SERVER_URL=http://localhost:8761/eureka/ go run main.go
```

### With Docker

Build the image:

```
docker build -t go-simple-service .
```

Run the container:

```
docker run -p 5002:5002 --network=micro_net go-simple-service
```

## Eureka Registration

Registration follows ADDING_A_MICROSERVICE.md Step 4b (plain REST against the Eureka API):
`POST /eureka/apps/GO-SERVICE` on startup, `PUT` heartbeat every 30 s,
`DELETE` on shutdown.

| Env var | Default | Purpose |
|---|---|---|
| `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` | Eureka base URL |
| `PORT` | `5002` | Listen port |

The service appears as `GO-SERVICE` (instance `go-service:go-service:5002`) in the Eureka
dashboard within ~30 s of startup.

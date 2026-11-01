# Demo .NET Microservice

ASP.NET Core minimal API member of the demo-microservices family: the service
contract (`/info`, `/process`, `/health`) plus **Eureka registration through the
real Steeltoe client** — the guide's *Step 4a* path, in deliberate contrast with
`demo-go-service`, which speaks the Eureka REST API itself because Go has no
maintained client (*Step 4b*). It owns port **5003** and is wired into
docker-compose, the gateway route table, and the Java service's Feign clients.

The 32-pattern catalog is not implemented here yet — this is the contract-first
member; see `ADDING_A_MICROSERVICE.md` for the family rules.

## Features

* `POST /process` doubles the numeric input — the cross-service interop contract.
* `GET /info` returns basic metadata; `GET /health` returns liveness.
* Registers with Eureka via **Steeltoe.Discovery.Eureka** (register → heartbeat
  every 30 s → deregister on graceful shutdown); appears as `DOTNET-SERVICE`.
* Maps the repo-wide `EUREKA_SERVER_URL` env var onto Steeltoe's
  `Eureka:Client:ServiceUrl` key, so it configures like its siblings.
* Dockerized with a multi-stage build (`sdk:8.0` → `aspnet:8.0`), non-root,
  with a curl-based compose healthcheck.

## Prerequisites

* .NET 8 SDK (only for local runs — the Dockerfile restores/publishes in-image)
* Eureka server running at `http://eureka-server:8761/eureka/`

## Project Structure

```
.
├── demo-dotnet-service.csproj  # net8.0; single PackageReference: Steeltoe.Discovery.Eureka
├── Program.cs                  # Minimal API endpoints + Steeltoe Eureka wiring
├── appsettings.json            # Eureka client/instance defaults (env vars override)
├── Dockerfile                  # Multi-stage container build
├── .dockerignore               # Keeps bin/obj out of the build context
├── .gitignore                  # Ignores bin/obj from local IDE builds
├── README.md
└── info.txt
```

## Endpoints

### POST `/process`

Accepts a JSON payload with a numeric `value` and returns its double.

```
curl -X POST http://localhost:5003/process \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'
```

Response:

```json
{ "result": 20 }
```

### GET `/info`

```
curl http://localhost:5003/info
```

Response:

```json
{ "app": "dotnet-service", "status": "running" }
```

### GET `/health`

```json
{ "status": "UP" }
```

## Running the Service

### Docker Compose (recommended)

```
docker-compose up --build dotnet-service
curl http://localhost:5003/info
```

### Locally

```
cd demo-dotnet-service
dotnet run
```

Outside Docker, point the client at the local Eureka server and match the
compose port:

```
EUREKA_SERVER_URL=http://localhost:8761/eureka/ ASPNETCORE_URLS=http://+:5003 dotnet run
```

## Eureka Registration

Registration follows ADDING_A_MICROSERVICE.md **Step 4a** (real client): Steeltoe's
`AddEurekaDiscoveryClient()` starts registration and heartbeats as a hosted
service and deregisters on shutdown.

| Env var | Default | Purpose |
|---|---|---|
| `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` | Mapped onto `Eureka:Client:ServiceUrl` |
| `SERVICE_HOSTNAME` | `dotnet-service` | Hostname advertised to Eureka (compose hostname) |
| `ASPNETCORE_URLS` | `http://+:5003` (Dockerfile) | Kestrel bind; Steeltoe advertises this port |

The service appears as `DOTNET-SERVICE` in the Eureka dashboard within ~30 s of
startup. Peers reach it through the gateway (`GET /dotnet/info` on :8081 →
`lb://DOTNET-SERVICE`) and from the Java service's Feign client
(`DotNetServiceClient`, used by the `/api/v2/aggregate` route).

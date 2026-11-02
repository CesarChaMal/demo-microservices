# demo-gateway-service

Spring Cloud Gateway — the single entry point in front of the demo microservices.

## What it does

The full services each implement an **in-process** API-gateway pattern
(`patterns/integration/apiGateway.js` / `api_gateway.py`, Java's `/calculate`
route). This service is that idea promoted to a dedicated edge service: it
registers with Eureka like any other service and routes by path prefix to
`lb://<APPID>` targets, which Spring resolves through the Eureka registry with
client-side load balancing — so scaled-up instances are load balanced for free.

| Route | Target | Example |
|---|---|---|
| `/java/**` | `lb://JAVA-SERVICE` | `POST http://localhost:8081/java/process` → `{"result": …}` |
| `/node/**` | `lb://NODE-SERVICE` | `GET http://localhost:8081/node/info` |
| `/python/**` | `lb://PYTHON-SERVICE` | `POST http://localhost:8081/python/process` |
| `/go/**` | `lb://GO-SERVICE` | `GET http://localhost:8081/go/info` |

`StripPrefix=1` drops the service prefix: `/java/process` arrives at
JAVA-SERVICE as `/process` — the same contract endpoint every service exposes.

Unlike the 32-pattern full services, the gateway is core infrastructure (like
`demo-eureka-server`): it has no pattern catalog of its own. Its `/info`
endpoints and health are the standard Spring Actuator set.

## Run

Part of `docker compose up` (port **8081**, reserved in
`docs/ADDING_A_MICROSERVICE.md` §0). Depends on `eureka-server` being healthy.

```bash
# from the repo root
docker compose up --build -d gateway-service eureka-server
curl http://localhost:8081/actuator/gateway/routes   # every route + resolved target
curl -X POST http://localhost:8081/java/process -H 'Content-Type: application/json' -d '{"value":21}'
# {"result":42}
```

Bare-local: `./mvnw spring-boot:run` — the Eureka default then points at
`localhost:8761` (Docker sets `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` instead).

## Configuration

| Key | Default | Notes |
|---|---|---|
| `server.port` | `8081` | Reserved port (§0 port table) |
| `eureka.client.service-url.defaultZone` | `http://localhost:8761/eureka/` | Overridden in compose via `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE=${EUREKA_SERVER_URL}` — the same convention as `demo-java-service` |
| routes | see `application.yml` | Add a service ⇒ add one route block |

## Adding a service behind the gateway

One route block in `src/main/resources/application.yml` — `id`, `uri:
lb://<APPID-UPPERCASE>`, `Path=/<prefix>/**`, `StripPrefix=1`. No peer wiring
changes anywhere else; the gateway is an entry point, not a peer
(`docs/ADDING_A_MICROSERVICE.md` Step 7 does not apply to it).

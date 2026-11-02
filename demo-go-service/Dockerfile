# demo-go-service — build per docs/ADDING_A_MICROSERVICE.md Step 3 (multi-stage:
# golang builder, distroless runtime).

FROM golang:1.22-alpine AS builder

WORKDIR /src

# Copy the FULL source before `go mod tidy`: main.go imports intra-module
# packages (patterns/*, internal/*), so tidy on a partial module cannot
# resolve them and would strip the chi dependency from go.mod (no go.sum is
# committed). With all source present, tidy resolves every import, adds chi
# and generates go.sum in one shot.
COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server . && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./internal/healthcheck

FROM gcr.io/distroless/static-debian12:nonroot

# distroless ships no shell/curl, so the compose healthcheck execs our tiny
# probe binary instead (see internal/healthcheck/main.go).
COPY --from=builder /out/server /app/server
COPY --from=builder /out/healthcheck /app/healthcheck

USER nonroot:nonroot
EXPOSE 5002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/app/healthcheck"]

ENTRYPOINT ["/app/server"]

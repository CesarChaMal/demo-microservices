# Build stage — pinned Go toolchain tag (never latest).
FROM golang:1.22-alpine AS builder

WORKDIR /app

# go.mod only: the service uses the standard library exclusively, so
# `go mod tidy` resolves offline and no go.sum is committed.
COPY go.mod ./
RUN go mod tidy

COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /go-simple-service .

# Runtime stage — distroless static image, non-root user.
# Note: distroless ships no curl/wget, so compose healthchecks for this
# service must use an exec probe, not a curl probe.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /go-simple-service /go-simple-service

EXPOSE 5002
USER nonroot:nonroot

CMD ["/go-simple-service"]

module demo-go-service

go 1.22

// Single external dependency: the chi router. No go.sum is committed (the
// local build box has no Go toolchain); the Dockerfile regenerates it inside
// the builder with `go mod tidy`, which needs network access.
require github.com/go-chi/chi/v5 v5.0.12

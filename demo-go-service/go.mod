module demo-go-service

go 1.22

// Two external dependencies. No go.sum is committed (the local build box has
// no Go toolchain); the Dockerfile and CI regenerate it with `go mod tidy`,
// which needs network access.
require (
	github.com/go-chi/chi/v5 v5.0.12
	github.com/rabbitmq/amqp091-go v1.10.0
)

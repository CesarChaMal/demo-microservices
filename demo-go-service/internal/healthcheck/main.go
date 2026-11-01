// Command healthcheck is a tiny probe binary shipped next to the server in
// the distroless runtime image (which has no curl/wget/shell). The compose
// healthcheck execs it: /app/healthcheck. Exit 0 on a 2xx /health response,
// exit 1 otherwise.
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	url := "http://localhost:5002/health"
	if env := os.Getenv("HEALTHCHECK_URL"); env != "" {
		url = env
	}
	if len(os.Args) > 1 {
		url = os.Args[1]
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		os.Exit(0)
	}
	fmt.Fprintf(os.Stderr, "healthcheck: %s returned %s\n", url, resp.Status)
	os.Exit(1)
}

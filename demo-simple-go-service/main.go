// demo-simple-go-service — the "simple" family Go microservice.
//
// It implements the contract subset the simple family exposes, mirroring
// demo-simple-node-service / demo-simple-python-service:
//
//	GET  /info    -> {"app":"go-service","status":"running"}
//	POST /process -> {"result": value * 2}   (the cross-service interop contract)
//
// Plus one endpoint BEYOND the simple-family contract: GET /health ->
// {"status":"UP"} — the simple Node/Python services omit it; Go keeps it as
// a liveness probe target.
//
// Eureka registration uses plain REST calls (ADDING_A_MICROSERVICE.md Step 4b —
// Go has no maintained Eureka client): register on startup, heartbeat every
// 30 s, deregister on shutdown. The service registers as GO-SERVICE, the same
// identity the full demo-go-service uses (the simple family convention — the
// simple Node/Python services likewise register as node-service/python-service).
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	// appName is the Docker Compose hostname, vipAddress and Eureka instance prefix.
	appName = "go-service"
	// appID is the Eureka application id (must be UPPERCASE — guide Step 4b).
	appID = "GO-SERVICE"
	// defaultPort follows the simple-family convention of reusing the language's
	// port: 5002 is reserved for demo-go-service in the guide's port table.
	defaultPort       = "5002"
	defaultEurekaURL  = "http://eureka-server:8761/eureka/"
	heartbeatEvery    = 30 * time.Second
	leaseDurationSecs = 30
	registerAttempts  = 10
	registerRetryWait = 3 * time.Second
)

var (
	port       = envOr("PORT", defaultPort)
	eurekaURL  = envOr("EUREKA_SERVER_URL", defaultEurekaURL)
	instanceID = fmt.Sprintf("%s:%s:%s", appName, appName, port)

	httpClient = &http.Client{Timeout: 5 * time.Second}
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// --- Eureka instance document (guide Step 4b shape) ------------------------

type eurekaPort struct {
	Dollar  int  `json:"$"`
	Enabled bool `json:"enabled"`
}

type eurekaDataCenterInfo struct {
	Class string `json:"@class"`
	Name  string `json:"name"`
}

type eurekaLeaseInfo struct {
	DurationInSecs int `json:"durationInSecs"`
}

type eurekaInstance struct {
	InstanceID       string               `json:"instanceId"`
	HostName         string               `json:"hostName"`
	App              string               `json:"app"`
	IPAddr           string               `json:"ipAddr"`
	Status           string               `json:"status"`
	Port             eurekaPort           `json:"port"`
	DataCenterInfo   eurekaDataCenterInfo `json:"dataCenterInfo"`
	LeaseInfo        eurekaLeaseInfo      `json:"leaseInfo"`
	HomePageURL      string               `json:"homePageUrl"`
	StatusPageURL    string               `json:"statusPageUrl"`
	HealthCheckURL   string               `json:"healthCheckUrl"`
	VipAddress       string               `json:"vipAddress"`
	SecureVipAddress string               `json:"secureVipAddress"`
}

type eurekaRegistration struct {
	Instance eurekaInstance `json:"instance"`
}

func buildRegistration() (eurekaRegistration, error) {
	portNum, err := strconv.Atoi(port)
	if err != nil {
		return eurekaRegistration{}, fmt.Errorf("invalid PORT %q: %w", port, err)
	}
	// Compose hostname, not localhost — URLs must be reachable from the
	// Eureka container or the instance gets marked DOWN (guide Step 4b).
	base := "http://" + appName + ":" + port
	return eurekaRegistration{
		Instance: eurekaInstance{
			InstanceID: instanceID,
			HostName:   appName,
			App:        appID,
			IPAddr:     appName,
			Status:     "UP",
			Port:       eurekaPort{Dollar: portNum, Enabled: true},
			DataCenterInfo: eurekaDataCenterInfo{
				Class: "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
				Name:  "MyOwn",
			},
			LeaseInfo:        eurekaLeaseInfo{DurationInSecs: leaseDurationSecs},
			HomePageURL:      base + "/",
			StatusPageURL:    base + "/health",
			HealthCheckURL:   base + "/health",
			VipAddress:       appName,
			SecureVipAddress: appName,
		},
	}, nil
}

// --- Minimal Eureka REST client --------------------------------------------

func eurekaBase() string {
	return strings.TrimSuffix(eurekaURL, "/")
}

func appsPath() string {
	return "/apps/" + appID
}

func eurekaRequest(method, path string, body []byte) (int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, eurekaBase()+path, reader)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, nil
}

func register() error {
	doc, err := buildRegistration()
	if err != nil {
		return err
	}
	payload, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	status, err := eurekaRequest(http.MethodPost, appsPath(), payload)
	if err != nil {
		return err
	}
	if status < 200 || status > 299 {
		return fmt.Errorf("eureka register returned status %d", status)
	}
	return nil
}

func heartbeat() (int, error) {
	return eurekaRequest(http.MethodPut, appsPath()+"/"+instanceID, nil)
}

func deregister() error {
	status, err := eurekaRequest(http.MethodDelete, appsPath()+"/"+instanceID, nil)
	if err != nil {
		return err
	}
	if status < 200 || status > 299 {
		return fmt.Errorf("eureka deregister returned status %d", status)
	}
	return nil
}

// registerAndHeartbeat registers (retrying while Eureka finishes booting),
// then heartbeats on the lease interval. A 404 means the server forgot the
// instance (expired lease) — re-register.
func registerAndHeartbeat() {
	registered := false
	for attempt := 1; attempt <= registerAttempts; attempt++ {
		err := register()
		if err == nil {
			registered = true
			break
		}
		log.Printf("eureka: registration attempt %d/%d failed: %v", attempt, registerAttempts, err)
		time.Sleep(registerRetryWait)
	}
	if !registered {
		log.Printf("eureka: giving up after %d attempts; serving without registration", registerAttempts)
		return
	}
	log.Printf("eureka: registered as %s (instance %s)", appID, instanceID)

	ticker := time.NewTicker(heartbeatEvery)
	defer ticker.Stop()
	for range ticker.C {
		status, err := heartbeat()
		if err != nil {
			log.Printf("eureka: heartbeat failed: %v", err)
			continue
		}
		switch {
		case status == http.StatusNotFound:
			log.Println("eureka: instance unknown (404), re-registering")
			if err := register(); err != nil {
				log.Printf("eureka: re-registration failed: %v", err)
			}
		case status < 200 || status > 299:
			log.Printf("eureka: heartbeat returned status %d", status)
		}
	}
}

// --- HTTP handlers ---------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func infoHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"app": appName, "status": "running"})
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "UP"})
}

func processHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Value *float64 `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Request body is required"})
		return
	}
	if body.Value == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Value must be a number"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]float64{"result": *body.Value * 2})
}

func main() {
	if _, err := strconv.Atoi(port); err != nil {
		log.Fatalf("invalid PORT %q: %v", port, err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /info", infoHandler)
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("POST /process", processHandler)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go registerAndHeartbeat()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-shutdown
		log.Println("shutting down")
		if err := deregister(); err != nil {
			log.Printf("eureka: deregister failed: %v", err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	log.Printf("%s listening on :%s (eureka: %s)", appName, port, eurekaURL)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}

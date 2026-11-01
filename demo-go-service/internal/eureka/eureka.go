// Package eureka implements the plain-REST Eureka client described in
// ADDING_A_MICROSERVICE.md Step 4b (languages without a maintained client
// library talk to Eureka with raw HTTP: register, heartbeat, deregister, query).
package eureka

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// DefaultServerURL matches the compose hostname used by every other service.
const DefaultServerURL = "http://eureka-server:8761/eureka/"

// ErrNotFound is returned when Eureka no longer knows about the instance
// (an expired lease) — callers re-register on it.
var ErrNotFound = errors.New("eureka: instance not found")

// Port mirrors Eureka's JSON port object: {"$":5002,"enabled":true}.
type Port struct {
	Dollar  int  `json:"$"`
	Enabled bool `json:"enabled"`
}

// DataCenterInfo satisfies Eureka's server-side deserialization requirements.
type DataCenterInfo struct {
	Class string `json:"@class"`
	Name  string `json:"name"`
}

// LeaseInfo tells the server how long to keep the lease between heartbeats.
type LeaseInfo struct {
	DurationInSecs int `json:"durationInSecs"`
}

// Instance is the registration document from the guide (Step 4b), verbatim.
type Instance struct {
	InstanceID       string         `json:"instanceId"`
	HostName         string         `json:"hostName"`
	App              string         `json:"app"`
	IPAddr           string         `json:"ipAddr"`
	Status           string         `json:"status"`
	Port             Port           `json:"port"`
	DataCenterInfo   DataCenterInfo `json:"dataCenterInfo"`
	LeaseInfo        LeaseInfo      `json:"leaseInfo"`
	HomePageURL      string         `json:"homePageUrl"`
	StatusPageURL    string         `json:"statusPageUrl"`
	HealthCheckURL   string         `json:"healthCheckUrl"`
	VipAddress       string         `json:"vipAddress"`
	SecureVipAddress string         `json:"secureVipAddress"`
}

type registrationRequest struct {
	Instance Instance `json:"instance"`
}

// InstanceInfo is the trimmed peer view returned by Query.
type InstanceInfo struct {
	InstanceID string `json:"instanceId"`
	HostName   string `json:"hostName"`
	Port       int    `json:"port"`
	Status     string `json:"status"`
}

type applicationResponse struct {
	Application struct {
		Name      string      `json:"name"`
		Instances []instance0 `json:"instance"`
	} `json:"application"`
}

type instance0 struct {
	InstanceID string `json:"instanceId"`
	HostName   string `json:"hostName"`
	Status     string `json:"status"`
	Port       Port   `json:"port"`
}

// Config describes this service's registration. AppID must be UPPERCASE
// (GO-SERVICE); hostName/URLs must use the compose hostname so the Eureka
// server's health probe can reach them.
type Config struct {
	ServerURL  string
	AppID      string
	InstanceID string
	HostName   string
	Port       int
}

// Client is a minimal Eureka REST client: net/http + encoding/json only.
type Client struct {
	cfg      Config
	http     *http.Client
	base     string
	stop     chan struct{}
	stopOnce sync.Once
}

// NewClient builds a client; an empty ServerURL falls back to DefaultServerURL.
func NewClient(cfg Config) *Client {
	if cfg.ServerURL == "" {
		cfg.ServerURL = DefaultServerURL
	}
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 10 * time.Second},
		base: strings.TrimRight(cfg.ServerURL, "/"),
		stop: make(chan struct{}),
	}
}

func (c *Client) instance() Instance {
	root := fmt.Sprintf("http://%s:%d/", c.cfg.HostName, c.cfg.Port)
	return Instance{
		InstanceID: c.cfg.InstanceID,
		HostName:   c.cfg.HostName,
		App:        c.cfg.AppID, // UPPERCASE per the guide
		IPAddr:     c.cfg.HostName,
		Status:     "UP",
		Port:       Port{Dollar: c.cfg.Port, Enabled: true},
		DataCenterInfo: DataCenterInfo{
			Class: "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
			Name:  "MyOwn",
		},
		LeaseInfo:        LeaseInfo{DurationInSecs: 30},
		HomePageURL:      root,
		StatusPageURL:    root + "health",
		HealthCheckURL:   root + "health",
		VipAddress:       c.cfg.HostName,
		SecureVipAddress: c.cfg.HostName,
	}
}

// Register POSTs the instance document to /eureka/apps/{APPID}.
func (c *Client) Register(ctx context.Context) error {
	body, err := json.Marshal(registrationRequest{Instance: c.instance()})
	if err != nil {
		return err
	}
	// Eureka answers 204 No Content on success.
	return c.do(ctx, http.MethodPost, c.appsPath(), body, http.StatusNoContent)
}

// Heartbeat renews the lease: PUT /eureka/apps/{appId}/{instanceId}.
func (c *Client) Heartbeat(ctx context.Context) error {
	path := c.appsPath() + "/" + c.cfg.InstanceID
	return c.do(ctx, http.MethodPut, path, nil, http.StatusOK)
}

// Deregister removes the instance: DELETE /eureka/apps/{appId}/{instanceId}.
func (c *Client) Deregister(ctx context.Context) error {
	path := c.appsPath() + "/" + c.cfg.InstanceID
	return c.do(ctx, http.MethodDelete, path, nil, http.StatusOK)
}

// Query returns the live instances of an app, reading hostName + port.$.
func (c *Client) Query(ctx context.Context, appID string) ([]InstanceInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/apps/"+appID, nil)
	if err != nil {
		return nil, err
	}
	// Accept/Content-Type application/json on every call (guide rule).
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("eureka: query %s: unexpected status %s", appID, resp.Status)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out applicationResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	instances := make([]InstanceInfo, 0, len(out.Application.Instances))
	for _, in := range out.Application.Instances {
		instances = append(instances, InstanceInfo{
			InstanceID: in.InstanceID,
			HostName:   in.HostName,
			Port:       in.Port.Dollar,
			Status:     in.Status,
		})
	}
	return instances, nil
}

// StartHeartbeats renews the lease every interval until StopHeartbeats.
// A 404 means the lease expired server-side; the loop re-registers.
func (c *Client) StartHeartbeats(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stop:
				return
			case <-ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				err := c.Heartbeat(ctx)
				if errors.Is(err, ErrNotFound) {
					log.Printf("eureka: lease expired, re-registering %s", c.cfg.AppID)
					if rerr := c.Register(ctx); rerr != nil {
						log.Printf("eureka: re-register failed: %v", rerr)
					}
				} else if err != nil {
					log.Printf("eureka: heartbeat failed: %v", err)
				}
				cancel()
			}
		}
	}()
}

// StopHeartbeats stops the background loop (idempotent).
func (c *Client) StopHeartbeats() {
	c.stopOnce.Do(func() { close(c.stop) })
}

func (c *Client) appsPath() string { return c.base + "/apps/" + c.cfg.AppID }

func (c *Client) do(ctx context.Context, method, path string, body []byte, wantStatus int) error {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode != wantStatus && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		return fmt.Errorf("eureka: %s %s: unexpected status %s (want %d)",
			method, path, resp.Status, wantStatus)
	}
	return nil
}

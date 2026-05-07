package clawdb

import (
	"context"
	"encoding/json"
)

// HealthStatus reports server health information.
type HealthStatus struct {
	OK         bool            `json:"ok"`
	Version    string          `json:"version"`
	Components map[string]bool `json:"components"`
	UptimeSecs float64         `json:"uptime_secs"`
	RequestID  string          `json:"request_id"`
}

// HealthClient checks service readiness.
type HealthClient struct {
	*httpClient
}

func newHealthClient(cfg *Config) *HealthClient {
	return &HealthClient{newHTTPClient(cfg, nil)}
}

// Check verifies the health of the configured ClawDB endpoint. GET /v1/health
func (h *HealthClient) Check(ctx context.Context) (*HealthStatus, error) {
	out, err := h.get(ctx, "/v1/health")
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var status HealthStatus
	_ = json.Unmarshal(raw, &status)
	return &status, nil
}

// Ready checks readiness. GET /v1/ready
func (h *HealthClient) Ready(ctx context.Context) (bool, error) {
	_, err := h.get(ctx, "/v1/ready")
	if err != nil {
		return false, err
	}
	return true, nil
}

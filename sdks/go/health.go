package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

// HealthStatus reports server health information.
type HealthStatus struct {
	OK         bool              `json:"ok"`
	Version    string            `json:"version"`
	Components map[string]string `json:"components"`
}

// HealthClient checks service readiness.
type HealthClient struct {
	cfg  *Config
	http *http.Client
}

func newHealthClient(cfg *Config) *HealthClient {
	return &HealthClient{cfg: cfg, http: &http.Client{Timeout: cfg.Timeout}}
}

// Check verifies the health of the configured ClawDB endpoint.
func (h *HealthClient) Check(ctx context.Context) (*HealthStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.Endpoint+"/v1/health", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.http.Do(req)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeUnavailable, Message: err.Error()}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, FromHTTPResponse(resp.StatusCode, string(raw))
	}
	var status HealthStatus
	_ = json.Unmarshal(raw, &status)
	return &status, nil
}

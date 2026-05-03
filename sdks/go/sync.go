package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

// SyncClient manages synchronisation with ClawDB Cloud.
type SyncClient struct {
	cfg     *Config
	session *Session
	http    *http.Client
}

func newSyncClient(cfg *Config, session *Session) *SyncClient {
	return &SyncClient{cfg: cfg, session: session, http: &http.Client{Timeout: cfg.Timeout}}
}

func (s *SyncClient) post(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.Endpoint+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if s.session != nil && s.session.Token != "" {
		req.Header.Set("Authorization", "Bearer "+s.session.Token)
	} else if s.cfg.APIKey != "" {
		req.Header.Set("X-Api-Key", s.cfg.APIKey)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeUnavailable, Message: err.Error()}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, FromHTTPResponse(resp.StatusCode, string(raw))
	}
	var out map[string]interface{}
	_ = json.Unmarshal(raw, &out)
	return out, nil
}

// Push pushes local memories to ClawDB Cloud.
func (s *SyncClient) Push(ctx context.Context) (*SyncResult, error) {
	out, err := s.post(ctx, "/v1/sync/push", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Pull pulls remote memories from ClawDB Cloud.
func (s *SyncClient) Pull(ctx context.Context) (*SyncResult, error) {
	out, err := s.post(ctx, "/v1/sync/pull", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Sync pushes then pulls.
func (s *SyncClient) Sync(ctx context.Context) (*SyncResult, error) {
	if _, err := s.Push(ctx); err != nil {
		return nil, err
	}
	return s.Pull(ctx)
}

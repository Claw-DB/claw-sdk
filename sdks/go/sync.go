package clawdb

import (
	"context"
	"encoding/json"
)

// SyncClient manages synchronisation with ClawDB Cloud.
type SyncClient struct {
	*httpClient
}

func newSyncClient(cfg *Config, session *Session) *SyncClient {
	return &SyncClient{newHTTPClient(cfg, session)}
}

// Sync pushes then pulls. POST /v1/sync
func (s *SyncClient) Sync(ctx context.Context) (*SyncResult, error) {
	out, err := s.post(ctx, "/v1/sync", nil)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Push pushes local memories to ClawDB Cloud. POST /v1/sync/push
func (s *SyncClient) Push(ctx context.Context) (*SyncActionResult, error) {
	out, err := s.post(ctx, "/v1/sync/push", nil)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncActionResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Pull pulls remote memories from ClawDB Cloud. POST /v1/sync/pull
func (s *SyncClient) Pull(ctx context.Context) (*SyncActionResult, error) {
	out, err := s.post(ctx, "/v1/sync/pull", nil)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncActionResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Reconcile reconciles divergent state. POST /v1/sync/reconcile
func (s *SyncClient) Reconcile(ctx context.Context) (*SyncActionResult, error) {
	out, err := s.post(ctx, "/v1/sync/reconcile", nil)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncActionResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Status returns sync status. GET /v1/sync/status
func (s *SyncClient) Status(ctx context.Context) (*SyncStatusResult, error) {
	out, err := s.get(ctx, "/v1/sync/status")
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result SyncStatusResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

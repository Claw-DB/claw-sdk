package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

// MemoryClient provides memory operations.
type MemoryClient struct {
	cfg     *Config
	session *Session
	http    *http.Client
}

func newMemoryClient(cfg *Config, session *Session) *MemoryClient {
	return &MemoryClient{
		cfg:     cfg,
		session: session,
		http:    &http.Client{Timeout: cfg.Timeout},
	}
}

func (m *MemoryClient) doPost(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.cfg.Endpoint+path, bytes.NewReader(body))
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	if m.session != nil && m.session.Token != "" {
		req.Header.Set("Authorization", "Bearer "+m.session.Token)
	} else if m.cfg.APIKey != "" {
		req.Header.Set("X-Api-Key", m.cfg.APIKey)
	}
	resp, err := m.http.Do(req)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeUnavailable, Message: err.Error()}
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, FromHTTPResponse(resp.StatusCode, string(b))
	}
	var out map[string]interface{}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	return out, nil
}

// Remember stores a new memory.
func (m *MemoryClient) Remember(ctx context.Context, content string, opts *RememberOptions) (string, error) {
	if content == "" {
		return "", &ClawDBError{Code: ErrorCodeValidation, Message: "content must be non-empty"}
	}
	payload := map[string]interface{}{
		"content":  content,
		"agent_id": m.cfg.AgentID,
	}
	if opts != nil {
		if opts.MemoryType != "" {
			payload["memory_type"] = string(opts.MemoryType)
		}
		if opts.Tags != nil {
			payload["tags"] = opts.Tags
		}
		if opts.TTLDays > 0 {
			payload["ttl_days"] = opts.TTLDays
		}
	}
	out, err := m.doPost(ctx, "/v1/memory/remember", payload)
	if err != nil {
		return "", err
	}
	id, _ := out["memory_id"].(string)
	return id, nil
}

// Search searches memories semantically.
func (m *MemoryClient) Search(ctx context.Context, query string, opts *SearchOptions) ([]SearchHit, error) {
	topK := 5
	alpha := 0.7
	semantic := true
	if opts != nil {
		if opts.TopK > 0 {
			topK = opts.TopK
		}
		if opts.Alpha > 0 {
			alpha = opts.Alpha
		}
		semantic = opts.Semantic
	}
	if topK > 100 {
		return nil, &ClawDBError{Code: ErrorCodeValidation, Message: "top_k cannot exceed 100"}
	}
	out, err := m.doPost(ctx, "/v1/memory/search", map[string]interface{}{
		"query": query, "top_k": topK, "semantic": semantic, "alpha": alpha,
	})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["results"])
	var results []SearchHit
	_ = json.Unmarshal(raw, &results)
	return results, nil
}

// Recall retrieves specific memories by ID.
func (m *MemoryClient) Recall(ctx context.Context, memoryIDs []string) ([]SearchHit, error) {
	if len(memoryIDs) == 0 {
		return nil, &ClawDBError{Code: ErrorCodeValidation, Message: "memory_ids must be non-empty"}
	}
	out, err := m.doPost(ctx, "/v1/memory/recall", map[string]interface{}{"memory_ids": memoryIDs})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["memories"])
	var memories []SearchHit
	_ = json.Unmarshal(raw, &memories)
	return memories, nil
}

// Forget soft-deletes a memory.
func (m *MemoryClient) Forget(ctx context.Context, memoryID string) error {
	_, err := m.doPost(ctx, "/v1/memory/forget", map[string]interface{}{"memory_id": memoryID})
	return err
}

// List lists memories with optional filters.
func (m *MemoryClient) List(ctx context.Context, memoryType string, limit, offset int) ([]MemoryRecord, error) {
	out, err := m.doPost(ctx, "/v1/memory/list", map[string]interface{}{
		"memory_type": memoryType, "limit": limit, "offset": offset,
	})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["memories"])
	var memories []MemoryRecord
	_ = json.Unmarshal(raw, &memories)
	return memories, nil
}

package clawdb

import (
	"context"
	"encoding/json"
	"fmt"
)

// MemoryClient provides memory operations.
type MemoryClient struct {
	*httpClient
}

func newMemoryClient(cfg *Config, session *Session) *MemoryClient {
	return &MemoryClient{newHTTPClient(cfg, session)}
}

// Remember stores a new memory. POST /v1/memories
func (m *MemoryClient) Remember(ctx context.Context, content string, opts *RememberOptions) (string, error) {
	if content == "" {
		return "", &ClawDBError{Code: ErrorCodeValidation, Message: "content must be non-empty"}
	}
	out, err := m.post(ctx, "/v1/memories", map[string]interface{}{"content": content})
	if err != nil {
		return "", err
	}
	id, _ := out["memory_id"].(string)
	return id, nil
}

// RememberTyped stores a typed memory. POST /v1/memories
func (m *MemoryClient) RememberTyped(ctx context.Context, content string, opts *RememberOptions) (string, error) {
	if content == "" {
		return "", &ClawDBError{Code: ErrorCodeValidation, Message: "content must be non-empty"}
	}
	payload := map[string]interface{}{"content": content}
	if opts != nil {
		if opts.MemoryType != "" {
			payload["type"] = string(opts.MemoryType)
		}
		if opts.Tags != nil {
			payload["tags"] = opts.Tags
		}
		if opts.Metadata != nil {
			raw, _ := json.Marshal(opts.Metadata)
			payload["metadata_json"] = string(raw)
		}
	}
	out, err := m.post(ctx, "/v1/memories", payload)
	if err != nil {
		return "", err
	}
	id, _ := out["memory_id"].(string)
	return id, nil
}

// Update updates an existing memory. PATCH /v1/memories/:id
func (m *MemoryClient) Update(ctx context.Context, memoryID, content string) (bool, error) {
	out, err := m.patch(ctx, fmt.Sprintf("/v1/memories/%s", memoryID), map[string]interface{}{"content": content})
	if err != nil {
		return false, err
	}
	updated, _ := out["updated"].(bool)
	return updated, nil
}

// Search searches memories semantically. GET /v1/memories/search
func (m *MemoryClient) Search(ctx context.Context, query string, opts *SearchOptions) ([]SearchHit, error) {
	topK := 5
	if opts != nil && opts.TopK > 0 {
		topK = opts.TopK
	}
	path := fmt.Sprintf("/v1/memories/search?query=%s&top_k=%d", query, topK)
	if opts != nil && opts.Semantic {
		path += "&semantic=true"
	}
	out, err := m.get(ctx, path)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["hits"])
	var results []SearchHit
	_ = json.Unmarshal(raw, &results)
	return results, nil
}

// Get retrieves a single memory. GET /v1/memories/:id
func (m *MemoryClient) Get(ctx context.Context, memoryID string) (*MemoryRecord, error) {
	out, err := m.get(ctx, fmt.Sprintf("/v1/memories/%s", memoryID))
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var rec MemoryRecord
	_ = json.Unmarshal(raw, &rec)
	return &rec, nil
}

// Recall retrieves specific memories by ID. POST /v1/memories (multi-get via recall)
func (m *MemoryClient) Recall(ctx context.Context, memoryIDs []string) ([]MemoryRecord, error) {
	if len(memoryIDs) == 0 {
		return nil, &ClawDBError{Code: ErrorCodeValidation, Message: "memory_ids must be non-empty"}
	}
	// Use list with IDs filter — server must support memory_ids param
	out, err := m.post(ctx, "/v1/memories/recall", map[string]interface{}{"memory_ids": memoryIDs})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["memories"])
	var memories []MemoryRecord
	_ = json.Unmarshal(raw, &memories)
	return memories, nil
}

// Forget soft-deletes a memory. DELETE /v1/memories/:id
func (m *MemoryClient) Forget(ctx context.Context, memoryID string) error {
	_, err := m.delete(ctx, fmt.Sprintf("/v1/memories/%s", memoryID))
	return err
}

// List lists memories. GET /v1/memories
func (m *MemoryClient) List(ctx context.Context, memoryType string, limit, offset int) ([]MemoryRecord, error) {
	path := fmt.Sprintf("/v1/memories?limit=%d&offset=%d", limit, offset)
	if memoryType != "" {
		path += "&type=" + memoryType
	}
	out, err := m.get(ctx, path)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["memories"])
	var memories []MemoryRecord
	_ = json.Unmarshal(raw, &memories)
	return memories, nil
}

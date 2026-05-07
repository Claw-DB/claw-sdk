package clawdb

import (
	"context"
	"encoding/json"
	"fmt"
)

// TxClient provides transactional memory operations.
type TxClient struct {
	*httpClient
}

func newTxClient(cfg *Config, session *Session) *TxClient {
	return &TxClient{newHTTPClient(cfg, session)}
}

// Begin starts a transaction. POST /v1/tx
func (t *TxClient) Begin(ctx context.Context) (string, error) {
	out, err := t.post(ctx, "/v1/tx", nil)
	if err != nil {
		return "", err
	}
	txID, _ := out["tx_id"].(string)
	return txID, nil
}

// Remember adds a memory to a transaction. POST /v1/tx/:id/memories
func (t *TxClient) Remember(ctx context.Context, txID, content string) (string, error) {
	out, err := t.post(ctx, fmt.Sprintf("/v1/tx/%s/memories", txID), map[string]interface{}{"content": content})
	if err != nil {
		return "", err
	}
	memID, _ := out["memory_id"].(string)
	return memID, nil
}

// RememberTyped adds a typed memory to a transaction. POST /v1/tx/:id/memories/typed
func (t *TxClient) RememberTyped(ctx context.Context, txID, content, memType string, tags []string, metadata map[string]interface{}) (string, error) {
	metaJSON, _ := json.Marshal(metadata)
	out, err := t.post(ctx, fmt.Sprintf("/v1/tx/%s/memories/typed", txID), map[string]interface{}{
		"content":       content,
		"type":          memType,
		"tags":          tags,
		"metadata_json": string(metaJSON),
	})
	if err != nil {
		return "", err
	}
	memID, _ := out["memory_id"].(string)
	return memID, nil
}

// Commit commits a transaction. POST /v1/tx/:id/commit
func (t *TxClient) Commit(ctx context.Context, txID string) (bool, error) {
	out, err := t.post(ctx, fmt.Sprintf("/v1/tx/%s/commit", txID), nil)
	if err != nil {
		return false, err
	}
	committed, _ := out["committed"].(bool)
	return committed, nil
}

// Rollback rolls back a transaction. POST /v1/tx/:id/rollback
func (t *TxClient) Rollback(ctx context.Context, txID string) (bool, error) {
	out, err := t.post(ctx, fmt.Sprintf("/v1/tx/%s/rollback", txID), nil)
	if err != nil {
		return false, err
	}
	rolledBack, _ := out["rolled_back"].(bool)
	return rolledBack, nil
}

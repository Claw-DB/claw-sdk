package clawdb

import (
	"context"
	"encoding/json"
	"fmt"
)

// BranchesClient provides branch management operations.
type BranchesClient struct {
	*httpClient
}

func newBranchesClient(cfg *Config, session *Session) *BranchesClient {
	return &BranchesClient{newHTTPClient(cfg, session)}
}

func decodeBranch(out map[string]interface{}) *BranchInfo {
	b, _ := out["branch"].(map[string]interface{})
	if b == nil {
		b = out
	}
	raw, _ := json.Marshal(b)
	var info BranchInfo
	_ = json.Unmarshal(raw, &info)
	return &info
}

// Fork creates a new branch. POST /v1/branches
func (b *BranchesClient) Fork(ctx context.Context, name string, from string) (*BranchInfo, error) {
	payload := map[string]interface{}{"name": name}
	if from != "" {
		payload["from"] = from
	}
	out, err := b.post(ctx, "/v1/branches", payload)
	if err != nil {
		return nil, err
	}
	return decodeBranch(out), nil
}

// List returns all branches. GET /v1/branches
func (b *BranchesClient) List(ctx context.Context, status string) ([]BranchInfo, error) {
	path := "/v1/branches"
	if status != "" {
		path += "?status=" + status
	}
	out, err := b.get(ctx, path)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["branches"])
	var branches []BranchInfo
	_ = json.Unmarshal(raw, &branches)
	return branches, nil
}

// GetTrunk returns the trunk branch. GET /v1/branches/trunk
func (b *BranchesClient) GetTrunk(ctx context.Context) (*BranchInfo, error) {
	out, err := b.get(ctx, "/v1/branches/trunk")
	if err != nil {
		return nil, err
	}
	return decodeBranch(out), nil
}

// GetByName returns a branch by name. GET /v1/branches/by-name/:name
func (b *BranchesClient) GetByName(ctx context.Context, name string) (*BranchInfo, error) {
	out, err := b.get(ctx, fmt.Sprintf("/v1/branches/by-name/%s", name))
	if err != nil {
		return nil, err
	}
	return decodeBranch(out), nil
}

// Get returns a branch by ID. GET /v1/branches/:id
func (b *BranchesClient) Get(ctx context.Context, branchID string) (*BranchInfo, error) {
	out, err := b.get(ctx, fmt.Sprintf("/v1/branches/%s", branchID))
	if err != nil {
		return nil, err
	}
	return decodeBranch(out), nil
}

// Discard deletes a branch. DELETE /v1/branches/:id
func (b *BranchesClient) Discard(ctx context.Context, branchID string) error {
	_, err := b.delete(ctx, fmt.Sprintf("/v1/branches/%s", branchID))
	return err
}

// Archive archives a branch. POST /v1/branches/:id/archive
func (b *BranchesClient) Archive(ctx context.Context, branchID string) error {
	_, err := b.post(ctx, fmt.Sprintf("/v1/branches/%s/archive", branchID), nil)
	return err
}

// Merge merges source into target. POST /v1/branches/:id/merge
func (b *BranchesClient) Merge(ctx context.Context, branchID, target, strategy string) (*MergeResult, error) {
	out, err := b.post(ctx, fmt.Sprintf("/v1/branches/%s/merge", branchID), map[string]interface{}{
		"target":   target,
		"strategy": strategy,
	})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result MergeResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Diff computes the diff between a branch and a target. GET /v1/branches/:id/diff
func (b *BranchesClient) Diff(ctx context.Context, branchID, target string) (*DiffResult, error) {
	path := fmt.Sprintf("/v1/branches/%s/diff", branchID)
	if target != "" {
		path += "?target=" + target
	}
	out, err := b.get(ctx, path)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var diff DiffResult
	_ = json.Unmarshal(raw, &diff)
	return &diff, nil
}

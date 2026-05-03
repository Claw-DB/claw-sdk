package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

// BranchesClient provides branch management operations.
type BranchesClient struct {
	cfg     *Config
	session *Session
	http    *http.Client
}

func newBranchesClient(cfg *Config, session *Session) *BranchesClient {
	return &BranchesClient{cfg: cfg, session: session, http: &http.Client{Timeout: cfg.Timeout}}
}

func (b *BranchesClient) doPost(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, b.cfg.Endpoint+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if b.session != nil && b.session.Token != "" {
		req.Header.Set("Authorization", "Bearer "+b.session.Token)
	} else if b.cfg.APIKey != "" {
		req.Header.Set("X-Api-Key", b.cfg.APIKey)
	}
	resp, err := b.http.Do(req)
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

// Fork creates a new branch.
func (b *BranchesClient) Fork(ctx context.Context, name string, parent string) (*BranchInfo, error) {
	if parent == "" {
		parent = "trunk"
	}
	out, err := b.doPost(ctx, "/v1/branches/fork", map[string]interface{}{"name": name, "parent": parent})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["branch"])
	var branch BranchInfo
	_ = json.Unmarshal(raw, &branch)
	return &branch, nil
}

// List returns all branches, optionally filtered by status.
func (b *BranchesClient) List(ctx context.Context, status string) ([]BranchInfo, error) {
	out, err := b.doPost(ctx, "/v1/branches/list", map[string]interface{}{"status": status})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["branches"])
	var branches []BranchInfo
	_ = json.Unmarshal(raw, &branches)
	return branches, nil
}

// Diff computes the diff between two branches.
func (b *BranchesClient) Diff(ctx context.Context, branchA, branchB string) (*DiffResult, error) {
	out, err := b.doPost(ctx, "/v1/branches/diff", map[string]interface{}{"branch_a": branchA, "branch_b": branchB})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var diff DiffResult
	_ = json.Unmarshal(raw, &diff)
	return &diff, nil
}

// Merge merges source into target.
func (b *BranchesClient) Merge(ctx context.Context, source, into, strategy string) (*MergeResult, error) {
	out, err := b.doPost(ctx, "/v1/branches/merge", map[string]interface{}{"source": source, "into": into, "strategy": strategy})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var result MergeResult
	_ = json.Unmarshal(raw, &result)
	return &result, nil
}

// Discard removes a branch permanently.
func (b *BranchesClient) Discard(ctx context.Context, name string) error {
	_, err := b.doPost(ctx, "/v1/branches/discard", map[string]interface{}{"name": name})
	return err
}

// Archive moves a branch to archived status.
func (b *BranchesClient) Archive(ctx context.Context, name string) error {
	_, err := b.doPost(ctx, "/v1/branches/archive", map[string]interface{}{"name": name})
	return err
}

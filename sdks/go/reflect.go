package clawdb

import (
	"context"
	"encoding/json"
	"fmt"
)

// ReflectClient triggers and monitors reflection jobs.
type ReflectClient struct {
	*httpClient
}

func newReflectClient(cfg *Config, session *Session) *ReflectClient {
	return &ReflectClient{newHTTPClient(cfg, session)}
}

// Trigger starts a reflection job. POST /v1/reflect
func (r *ReflectClient) Trigger(ctx context.Context) (*ReflectJob, error) {
	out, err := r.post(ctx, "/v1/reflect", nil)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var job ReflectJob
	_ = json.Unmarshal(raw, &job)
	return &job, nil
}

// ListJobs lists reflection jobs. GET /v1/reflect/jobs
func (r *ReflectClient) ListJobs(ctx context.Context, agentID, status string, limit, offset int) ([]ReflectJob, error) {
	path := fmt.Sprintf("/v1/reflect/jobs?agent_id=%s&limit=%d&offset=%d", agentID, limit, offset)
	if status != "" {
		path += "&status=" + status
	}
	out, err := r.get(ctx, path)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out["jobs"])
	var jobs []ReflectJob
	_ = json.Unmarshal(raw, &jobs)
	return jobs, nil
}

// GetJob fetches a specific job. GET /v1/reflect/jobs/:job_id
func (r *ReflectClient) GetJob(ctx context.Context, jobID string) (*ReflectJob, error) {
	out, err := r.get(ctx, fmt.Sprintf("/v1/reflect/jobs/%s", jobID))
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var job ReflectJob
	_ = json.Unmarshal(raw, &job)
	return &job, nil
}

// GetFacts returns extracted facts for an agent. GET /v1/reflect/facts/:agent_id
func (r *ReflectClient) GetFacts(ctx context.Context, agentID string) (map[string]interface{}, error) {
	return r.get(ctx, fmt.Sprintf("/v1/reflect/facts/%s", agentID))
}

// GetPreferences returns preferences for an agent. GET /v1/reflect/preferences/:agent_id
func (r *ReflectClient) GetPreferences(ctx context.Context, agentID string) (map[string]interface{}, error) {
	return r.get(ctx, fmt.Sprintf("/v1/reflect/preferences/%s", agentID))
}

// GetContradictions returns contradictions for an agent. GET /v1/reflect/contradictions/:agent_id
func (r *ReflectClient) GetContradictions(ctx context.Context, agentID string) (map[string]interface{}, error) {
	return r.get(ctx, fmt.Sprintf("/v1/reflect/contradictions/%s", agentID))
}

// ResolveContradiction resolves a contradiction. POST /v1/reflect/contradictions/:agent_id/:contradiction_id/resolve
func (r *ReflectClient) ResolveContradiction(ctx context.Context, agentID, contradictionID, strategy, mergedValueJSON string) (map[string]interface{}, error) {
	return r.post(ctx, fmt.Sprintf("/v1/reflect/contradictions/%s/%s/resolve", agentID, contradictionID), map[string]interface{}{
		"strategy":          strategy,
		"merged_value_json": mergedValueJSON,
	})
}

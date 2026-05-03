package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

)

// ReflectClient triggers and monitors reflection jobs.
type ReflectClient struct {
	cfg     *Config
	session *Session
	http    *http.Client
}

func newReflectClient(cfg *Config, session *Session) *ReflectClient {
	return &ReflectClient{cfg: cfg, session: session, http: &http.Client{Timeout: cfg.Timeout}}
}

func (r *ReflectClient) post(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, r.cfg.Endpoint+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if r.session != nil && r.session.Token != "" {
		req.Header.Set("Authorization", "Bearer "+r.session.Token)
	} else if r.cfg.APIKey != "" {
		req.Header.Set("X-Api-Key", r.cfg.APIKey)
	}
	resp, err := r.http.Do(req)
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

// Trigger starts a reflection job.
func (r *ReflectClient) Trigger(ctx context.Context, jobType string, dryRun bool) (*ReflectJob, error) {
	out, err := r.post(ctx, "/v1/reflect/trigger", map[string]interface{}{"job_type": jobType, "dry_run": dryRun})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var job ReflectJob
	_ = json.Unmarshal(raw, &job)
	return &job, nil
}

// Status polls the status of a reflection job.
func (r *ReflectClient) Status(ctx context.Context, jobID string) (*ReflectJob, error) {
	out, err := r.post(ctx, "/v1/reflect/status", map[string]interface{}{"job_id": jobID})
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var job ReflectJob
	_ = json.Unmarshal(raw, &job)
	return &job, nil
}

// WaitForCompletion polls until the job finishes or timeout is reached.
func (r *ReflectClient) WaitForCompletion(ctx context.Context, jobID string, pollInterval, timeout time.Duration) (*ReflectJob, error) {
	deadline := time.Now().Add(timeout)
	for {
		job, err := r.Status(ctx, jobID)
		if err != nil {
			return nil, err
		}
		if job.Status == "completed" || job.Status == "failed" {
			return job, nil
		}
		if time.Now().After(deadline) {
			return nil, &ClawDBError{Code: ErrorCodeTimeout, Message: "reflect job timed out"}
		}
		time.Sleep(pollInterval)
	}
}

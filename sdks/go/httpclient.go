package clawdb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// httpClient is a shared HTTP helper used by all sub-clients.
type httpClient struct {
	cfg     *Config
	session *Session
	http    *http.Client
}

func newHTTPClient(cfg *Config, session *Session) *httpClient {
	return &httpClient{cfg: cfg, session: session, http: &http.Client{Timeout: cfg.Timeout}}
}

func (c *httpClient) authHeader(req *http.Request) {
	if c.session != nil && c.session.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.session.Token)
	} else if c.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	}
}

func (c *httpClient) do(ctx context.Context, method, path string, payload interface{}) (map[string]interface{}, error) {
	var bodyReader io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.Endpoint+path, bodyReader)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c.authHeader(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, &ClawDBError{Code: ErrorCodeUnavailable, Message: err.Error()}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, FromHTTPResponse(resp.StatusCode, string(raw))
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, &ClawDBError{Code: ErrorCodeInternal, Message: fmt.Sprintf("json decode: %s", err)}
	}
	return out, nil
}

func (c *httpClient) post(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	return c.do(ctx, http.MethodPost, path, payload)
}

func (c *httpClient) get(ctx context.Context, path string) (map[string]interface{}, error) {
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *httpClient) delete(ctx context.Context, path string) (map[string]interface{}, error) {
	return c.do(ctx, http.MethodDelete, path, nil)
}

func (c *httpClient) patch(ctx context.Context, path string, payload interface{}) (map[string]interface{}, error) {
	return c.do(ctx, http.MethodPatch, path, payload)
}

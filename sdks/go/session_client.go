package clawdb

import (
	"context"
	"encoding/json"
	"fmt"
)

// SessionClient provides session-oriented operations.
type SessionClient struct {
	*httpClient
}

func newSessionClient(cfg *Config, session *Session) *SessionClient {
	return &SessionClient{newHTTPClient(cfg, session)}
}

// Create creates a new session. POST (implicit via SDK config — session is passed in headers)
func (s *SessionClient) Create(ctx context.Context, agentID, role string, scopes []string, ttlSecs int) (*Session, error) {
	payload := map[string]interface{}{
		"agent_id": agentID,
		"role":     role,
		"scopes":   scopes,
		"ttl_secs": ttlSecs,
	}
	out, err := s.post(ctx, "/v1/sessions", payload)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(out)
	var sess Session
	_ = json.Unmarshal(raw, &sess)
	return &sess, nil
}

// Validate validates the current session. GET /v1/sessions/me
func (s *SessionClient) Validate(ctx context.Context) (map[string]interface{}, error) {
	return s.get(ctx, "/v1/sessions/me")
}

// Revoke revokes a session by ID. DELETE /v1/sessions/:id
func (s *SessionClient) Revoke(ctx context.Context, sessionID string) error {
	_, err := s.delete(ctx, fmt.Sprintf("/v1/sessions/%s", sessionID))
	return err
}

// ActiveCount returns the number of active sessions. GET /v1/sessions/active/count
func (s *SessionClient) ActiveCount(ctx context.Context) (int, error) {
	out, err := s.get(ctx, "/v1/sessions/active/count")
	if err != nil {
		return 0, err
	}
	count, _ := out["count"].(float64)
	return int(count), nil
}

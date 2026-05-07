package clawdb

import "context"

// SessionClient provides session-oriented operations.
type SessionClient struct {
	cfg     *Config
	session *Session
}

func newSessionClient(cfg *Config, session *Session) *SessionClient {
	return &SessionClient{cfg: cfg, session: session}
}

// Create creates a new session placeholder for compatibility with the SDK surface.
func (s *SessionClient) Create(_ context.Context) (*Session, error) {
	if s.session == nil {
		s.session = &Session{AgentID: s.cfg.AgentID, Role: s.cfg.Role}
	}
	return s.session, nil
}

// Revoke revokes the current session placeholder.
func (s *SessionClient) Revoke(_ context.Context) error {
	s.session = nil
	return nil
}

// WhoAmI returns the current agent identity.
func (s *SessionClient) WhoAmI(_ context.Context) (string, error) {
	return s.cfg.AgentID, nil
}

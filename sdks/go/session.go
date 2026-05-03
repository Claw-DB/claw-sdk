package clawdb

import "time"

// Session holds an authenticated session token.
type Session struct {
	Token     string
	AgentID   string
	Role      string
	Scopes    []string
	ExpiresAt time.Time
}

// IsExpired returns true if the session has passed its expiry.
func (s *Session) IsExpired() bool {
	if s.ExpiresAt.IsZero() {
		return false
	}
	return time.Now().After(s.ExpiresAt)
}

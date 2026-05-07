package clawdb

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for a ClawDB client.
type Config struct {
	Endpoint  string
	APIKey    string
	AgentID   string
	Workspace string
	Role      string
	Region    string
	Timeout   time.Duration
	TLS       bool
	LogLevel  string
}

// DefaultConfig returns a Config populated with defaults.
func DefaultConfig() *Config {
	return &Config{
		Endpoint:  "http://localhost:50050",
		AgentID:   "default-agent",
		Workspace: "default",
		Role:      "assistant",
		Region:    "local",
		Timeout:   30 * time.Second,
		TLS:       false,
		LogLevel:  "info",
	}
}

// LoadConfig builds a Config from environment variables, falling back to defaults.
func LoadConfig() *Config {
	cfg := DefaultConfig()
	if v := os.Getenv("CLAWDB_ENDPOINT"); v != "" {
		cfg.Endpoint = v
	}
	if v := os.Getenv("CLAWDB_URL"); v != "" {
		cfg.Endpoint = v
	}
	if v := os.Getenv("CLAWDB_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("CLAWDB_AGENT_ID"); v != "" {
		cfg.AgentID = v
	}
	if v := os.Getenv("CLAWDB_WORKSPACE"); v != "" {
		cfg.Workspace = v
	}
	if v := os.Getenv("CLAWDB_ROLE"); v != "" {
		cfg.Role = v
	}
	if v := os.Getenv("CLAWDB_REGION"); v != "" {
		cfg.Region = v
	}
	if v := os.Getenv("CLAWDB_TIMEOUT_MS"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.Timeout = time.Duration(ms) * time.Millisecond
		}
	}
	if v := os.Getenv("CLAWDB_TLS"); v == "true" || v == "1" {
		cfg.TLS = true
	}
	return cfg
}

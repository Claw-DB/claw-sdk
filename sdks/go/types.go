package clawdb

import (
	"time"
)

// MemoryType categorises a memory record.
type MemoryType string

const (
	MemoryTypeContext        MemoryType = "context"
	MemoryTypeTask           MemoryType = "task"
	MemoryTypeToolOutput     MemoryType = "tool_output"
	MemoryTypeSession        MemoryType = "session"
	MemoryTypeReasoningTrace MemoryType = "reasoning_trace"
	MemoryTypeMessage        MemoryType = "message"
	MemoryTypeSummary        MemoryType = "summary"
)

// MemoryRecord is a single stored memory.
type MemoryRecord struct {
	ID              string                 `json:"id"`
	AgentID         string                 `json:"agent_id"`
	Content         string                 `json:"content"`
	MemoryType      MemoryType             `json:"memory_type"`
	Tags            []string               `json:"tags"`
	Metadata        map[string]interface{} `json:"metadata"`
	ImportanceScore float64                `json:"importance_score"`
	IsPromoted      bool                   `json:"is_promoted"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
}

// SearchHit is a flattened memory search result.
type SearchHit struct {
	ID         string                 `json:"id"`
	Content    string                 `json:"content"`
	Score      float64                `json:"score"`
	MemoryType MemoryType             `json:"memory_type"`
	Tags       []string               `json:"tags"`
	Metadata   map[string]interface{} `json:"metadata"`
	CreatedAt  time.Time              `json:"created_at"`
}

// BranchInfo describes a memory branch.
type BranchInfo struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Status          string    `json:"status"`
	ParentID        string    `json:"parent_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	DivergenceScore float64   `json:"divergence_score"`
}

// SyncResult reports the outcome of a sync operation.
type SyncResult struct {
	Pushed    int       `json:"pushed"`
	Pulled    int       `json:"pulled"`
	Conflicts int       `json:"conflicts"`
	SyncedAt  time.Time `json:"synced_at"`
}

// DiffResult describes differences between two branches.
type DiffResult struct {
	Added           int                      `json:"added"`
	Removed         int                      `json:"removed"`
	Modified        int                      `json:"modified"`
	DivergenceScore float64                  `json:"divergence_score"`
	EntityDiffs     []map[string]interface{} `json:"entity_diffs,omitempty"`
}

// MergeResult reports the outcome of a merge.
type MergeResult struct {
	Applied   int                      `json:"applied"`
	Conflicts []map[string]interface{} `json:"conflicts,omitempty"`
	Success   bool                     `json:"success"`
}

// ReflectJob describes an async reflection job.
type ReflectJob struct {
	JobID     string `json:"job_id"`
	Status    string `json:"status"`
	Processed int    `json:"processed"`
	Archived  int    `json:"archived"`
	Promoted  int    `json:"promoted"`
}

// AgentProfile holds the learned profile for an agent.
type AgentProfile struct {
	Preferences   map[string]interface{} `json:"preferences"`
	Facts         map[string]interface{} `json:"facts"`
	MemoryCount   int                    `json:"memory_count"`
	LastUpdatedAt time.Time              `json:"last_updated_at"`
}

// RememberOptions are optional parameters for storing a memory.
type RememberOptions struct {
	MemoryType MemoryType
	Tags       []string
	Metadata   map[string]interface{}
	TTLDays    int
}

// SearchOptions are optional parameters for memory search.
type SearchOptions struct {
	TopK     int
	Semantic bool
	Alpha    float64
	Filter   map[string]interface{}
}

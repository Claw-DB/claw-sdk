use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryType {
    Context,
    Task,
    ToolOutput,
    Session,
    ReasoningTrace,
    Message,
    Summary,
}

impl Default for MemoryType {
    fn default() -> Self {
        Self::Context
    }
}

impl std::fmt::Display for MemoryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Context => "context",
            Self::Task => "task",
            Self::ToolOutput => "tool_output",
            Self::Session => "session",
            Self::ReasoningTrace => "reasoning_trace",
            Self::Message => "message",
            Self::Summary => "summary",
        };
        f.write_str(s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRecord {
    pub id: String,
    pub content: String,
    pub memory_type: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub id: String,
    pub content: String,
    pub score: f64,
    pub memory_type: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub branch_id: String,
    pub name: String,
    pub branch_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub applied: u32,
    pub skipped: u32,
    pub conflicts: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub added: u32,
    pub removed: u32,
    pub modified: u32,
    pub unchanged: u32,
    pub divergence_score: f64,
    pub diff_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pushed: u32,
    pub pulled: u32,
    pub conflicts: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncActionResult {
    pub summary_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusResult {
    pub status_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectJob {
    pub job_id: String,
    pub status: String,
    pub message: Option<String>,
    pub skipped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxInfo {
    pub tx_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub role: String,
    pub scopes: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RememberOptions {
    pub memory_type: Option<String>,
    pub tags: Option<Vec<String>>,
    pub ttl_days: Option<u32>,
}

#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    pub top_k: Option<u32>,
    pub semantic: Option<bool>,
    pub alpha: Option<f64>,
    pub filter: Option<serde_json::Value>,
}

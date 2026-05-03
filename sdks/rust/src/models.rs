use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRecord {
    pub id: Uuid,
    pub agent_id: String,
    pub content: String,
    pub memory_type: MemoryType,
    #[serde(default)]
    pub tags: Vec<String>,
    pub importance_score: f64,
    pub is_promoted: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub memory: MemoryRecord,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub id: String,
    pub name: String,
    pub status: String,
    pub parent_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub divergence_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pushed: u32,
    pub pulled: u32,
    pub conflicts: u32,
    pub synced_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub added: u32,
    pub removed: u32,
    pub modified: u32,
    pub divergence_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub applied: u32,
    pub conflicts: Vec<serde_json::Value>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RememberOptions {
    pub memory_type: Option<MemoryType>,
    pub tags: Option<Vec<String>>,
    pub ttl_days: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchOptions {
    pub top_k: Option<u32>,
    pub semantic: Option<bool>,
    pub alpha: Option<f64>,
}

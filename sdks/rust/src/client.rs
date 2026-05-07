use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client as HttpClient, header};
use serde_json::{json, Value};
use tracing::info;

use crate::builder::ClawDBBuilder;
use crate::error::{SdkError, SdkResult};
use crate::models::{
    BranchInfo, DiffResult, HealthResponse, MemoryRecord, MergeResult, ReflectJob,
    RememberOptions, SearchHit, SearchOptions, SessionInfo, SyncActionResult,
    SyncResult, SyncStatusResult, TxInfo,
};

// ─── Internal shared state ────────────────────────────────────────────────────

struct ClawDBInner {
    endpoint: String,
    api_key: String,
    agent_id: String,
    timeout_ms: u64,
    http: HttpClient,
}

// ─── ClawDB client ─────────────────────────────────────────────────────────

/// The primary ClawDB client.
#[derive(Clone)]
pub struct ClawDB {
    inner: Arc<ClawDBInner>,
}

impl ClawDB {
    /// Create a builder to configure and construct a ClawDB client.
    pub fn builder() -> ClawDBBuilder {
        ClawDBBuilder::new()
    }

    /// Create a client from environment variables.
    pub async fn from_env() -> SdkResult<Self> {
        ClawDBBuilder::from_env().build().await
    }

    /// Automatically provision a usable endpoint following the SDK fallback order.
    pub async fn auto_provision() -> SdkResult<Self> {
        if let Ok(endpoint) = std::env::var("CLAWDB_URL") {
            return ClawDBBuilder::from_env().endpoint(endpoint).build().await;
        }
        if let Ok(api_key) = std::env::var("CLAWDB_API_KEY") {
            return ClawDBBuilder::from_env()
                .api_key(api_key)
                .endpoint("https://cloud.clawdb.dev")
                .build()
                .await;
        }
        if tokio::net::TcpStream::connect("127.0.0.1:50050").await.is_ok() {
            return ClawDBBuilder::from_env()
                .endpoint("http://localhost:50050")
                .build()
                .await;
        }
        Err(SdkError::Config("could not auto-provision clawdb-server".into()))
    }

    /// Create a client from an API key and endpoint.
    pub async fn from_api_key(api_key: impl Into<String>, endpoint: impl Into<String>) -> SdkResult<Self> {
        ClawDBBuilder::new().api_key(api_key).endpoint(endpoint).build().await
    }

    pub(crate) async fn new_internal(
        endpoint: String,
        api_key: String,
        agent_id: String,
        _workspace: String,
        _role: String,
        timeout_ms: u64,
    ) -> SdkResult<Self> {
        let mut default_headers = header::HeaderMap::new();
        if !api_key.is_empty() {
            let val = header::HeaderValue::from_str(&format!("Bearer {}", api_key))
                .map_err(|_| SdkError::Config("Invalid API key characters".into()))?;
            default_headers.insert(header::AUTHORIZATION, val);
        }
        let http = HttpClient::builder()
            .default_headers(default_headers)
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|e| SdkError::Config(e.to_string()))?;

        Ok(Self {
            inner: Arc::new(ClawDBInner { endpoint, api_key, agent_id, timeout_ms, http }),
        })
    }

    // ─── HTTP helpers ────────────────────────────────────────────────────

    async fn get(&self, path: &str) -> SdkResult<Value> {
        let url = format!("{}{}", self.inner.endpoint, path);
        let resp = self.inner.http.get(&url).send().await.map_err(SdkError::Reqwest)?;
        self.parse_response(resp).await
    }

    async fn post(&self, path: &str, body: Value) -> SdkResult<Value> {
        let url = format!("{}{}", self.inner.endpoint, path);
        let resp = self.inner.http.post(&url).json(&body).send().await.map_err(SdkError::Reqwest)?;
        self.parse_response(resp).await
    }

    async fn patch(&self, path: &str, body: Value) -> SdkResult<Value> {
        let url = format!("{}{}", self.inner.endpoint, path);
        let resp = self.inner.http.patch(&url).json(&body).send().await.map_err(SdkError::Reqwest)?;
        self.parse_response(resp).await
    }

    async fn delete(&self, path: &str) -> SdkResult<Value> {
        let url = format!("{}{}", self.inner.endpoint, path);
        let resp = self.inner.http.delete(&url).send().await.map_err(SdkError::Reqwest)?;
        self.parse_response(resp).await
    }

    async fn parse_response(&self, resp: reqwest::Response) -> SdkResult<Value> {
        let status = resp.status().as_u16();
        let text = resp.text().await.map_err(SdkError::Reqwest)?;
        if status >= 400 {
            return Err(SdkError::from_http(status, &text));
        }
        if text.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(SdkError::Serialization)
    }

    fn str_field(v: &Value, field: &str) -> String {
        v[field].as_str().unwrap_or_default().to_string()
    }

    fn extract_array<T: serde::de::DeserializeOwned>(v: &Value, field: &str) -> Vec<T> {
        let arr = if v[field].is_array() { &v[field] } else { v };
        serde_json::from_value(arr.clone()).unwrap_or_default()
    }

    // ─── Health ──────────────────────────────────────────────────────────

    /// Check server health.
    pub async fn health(&self) -> SdkResult<HealthResponse> {
        let v = self.get("/v1/health").await?;
        Ok(HealthResponse {
            status: Self::str_field(&v, "status"),
            version: v["version"].as_str().map(str::to_string),
        })
    }

    /// Ping the server (returns Ok if reachable).
    pub async fn ping(&self) -> SdkResult<()> {
        self.health().await.map(|_| ())
    }

    // ─── Sessions ────────────────────────────────────────────────────────

    /// Create a new session token.
    pub async fn create_session(&self, role: &str, scopes: &[&str], ttl_secs: u64) -> SdkResult<SessionInfo> {
        let v = self.post("/v1/sessions", json!({
            "role": role,
            "scopes": scopes,
            "ttl_secs": ttl_secs,
        })).await?;
        Ok(SessionInfo {
            session_id: Self::str_field(&v, "session_id"),
            role: Self::str_field(&v, "role"),
            scopes: v["scopes"].as_array()
                .map(|a| a.iter().filter_map(|s| s.as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
            expires_at: None,
        })
    }

    /// Validate the current session.
    pub async fn validate_session(&self) -> SdkResult<SessionInfo> {
        let v = self.get("/v1/sessions/me").await?;
        Ok(SessionInfo {
            session_id: Self::str_field(&v, "session_id"),
            role: Self::str_field(&v, "role"),
            scopes: v["scopes"].as_array()
                .map(|a| a.iter().filter_map(|s| s.as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
            expires_at: None,
        })
    }

    /// Revoke a session by ID.
    pub async fn revoke_session(&self, session_id: &str) -> SdkResult<bool> {
        let v = self.delete(&format!("/v1/sessions/{}", session_id)).await?;
        Ok(v["revoked"].as_bool().unwrap_or(true))
    }

    /// Get the count of active sessions.
    pub async fn active_session_count(&self) -> SdkResult<u64> {
        let v = self.get("/v1/sessions/active/count").await?;
        Ok(v["count"].as_u64().unwrap_or(0))
    }

    // ─── Memory ──────────────────────────────────────────────────────────

    /// Store a plain memory and return its ID.
    pub async fn remember(&self, content: impl Into<String>) -> SdkResult<String> {
        let content = content.into();
        if content.trim().is_empty() {
            return Err(SdkError::Validation { field: "content".into(), constraint: "must be non-empty".into() });
        }
        let v = self.post("/v1/memories", json!({ "content": content })).await?;
        Ok(Self::str_field(&v, "id"))
    }

    /// Store a typed memory and return its ID.
    pub async fn remember_typed(&self, content: impl Into<String>, opts: RememberOptions) -> SdkResult<String> {
        let content = content.into();
        let mut body = json!({ "content": content });
        if let Some(mt) = &opts.memory_type {
            body["type"] = json!(mt);
        }
        if let Some(tags) = &opts.tags {
            body["tags"] = json!(tags);
        }
        if let Some(ttl) = opts.ttl_days {
            body["ttl_days"] = json!(ttl);
        }
        let v = self.post("/v1/memories", body).await?;
        Ok(Self::str_field(&v, "id"))
    }

    /// Update an existing memory's content.
    pub async fn update_memory(&self, memory_id: &str, content: impl Into<String>) -> SdkResult<bool> {
        let v = self.patch(&format!("/v1/memories/{}", memory_id), json!({ "content": content.into() })).await?;
        Ok(v["updated"].as_bool().unwrap_or(true))
    }

    /// Semantic search over memories.
    pub async fn search(&self, query: impl Into<String>, opts: SearchOptions) -> SdkResult<Vec<SearchHit>> {
        let top_k = opts.top_k.unwrap_or(5);
        let v = self.post("/v1/memories/search", json!({
            "query": query.into(),
            "top_k": top_k,
            "semantic": opts.semantic.unwrap_or(true),
        })).await?;
        let hits: Vec<SearchHit> = Self::extract_array(&v, "hits");
        Ok(hits)
    }

    /// Recall specific memories by ID.
    pub async fn recall(&self, ids: &[&str]) -> SdkResult<Vec<MemoryRecord>> {
        let v = self.post("/v1/memories/recall", json!({ "ids": ids })).await?;
        let records: Vec<MemoryRecord> = Self::extract_array(&v, "memories");
        Ok(records)
    }

    /// List memories with optional type filter.
    pub async fn list_memories(&self, memory_type: Option<&str>, limit: Option<u32>) -> SdkResult<Vec<MemoryRecord>> {
        let mut path = "/v1/memories?".to_string();
        if let Some(mt) = memory_type { path.push_str(&format!("type={}&", mt)); }
        if let Some(l) = limit { path.push_str(&format!("limit={}", l)); }
        let v = self.get(&path).await?;
        let records: Vec<MemoryRecord> = Self::extract_array(&v, "memories");
        Ok(records)
    }

    /// Delete a memory by ID.
    pub async fn delete_memory(&self, memory_id: &str) -> SdkResult<bool> {
        let v = self.delete(&format!("/v1/memories/{}", memory_id)).await?;
        Ok(v["deleted"].as_bool().unwrap_or(true))
    }

    // ─── Branches ────────────────────────────────────────────────────────

    /// Fork a new branch.
    pub async fn branch(&self, name: &str, from: Option<&str>) -> SdkResult<BranchInfo> {
        let mut body = json!({ "name": name });
        if let Some(f) = from { body["from_branch_id"] = json!(f); }
        let v = self.post("/v1/branches", body).await?;
        Ok(BranchInfo {
            branch_id: Self::str_field(&v, "branch_id"),
            name: Self::str_field(&v, "name"),
            branch_json: v["branch_json"].as_str().map(str::to_string),
        })
    }

    /// List all branches.
    pub async fn list_branches(&self) -> SdkResult<Vec<BranchInfo>> {
        let v = self.get("/v1/branches").await?;
        let branches: Vec<BranchInfo> = Self::extract_array(&v, "branches");
        Ok(branches)
    }

    /// Get a branch by ID.
    pub async fn get_branch(&self, branch_id: &str) -> SdkResult<BranchInfo> {
        let v = self.get(&format!("/v1/branches/{}", branch_id)).await?;
        Ok(BranchInfo {
            branch_id: Self::str_field(&v, "branch_id"),
            name: Self::str_field(&v, "name"),
            branch_json: v["branch_json"].as_str().map(str::to_string),
        })
    }

    /// Get a branch by name.
    pub async fn get_branch_by_name(&self, name: &str) -> SdkResult<BranchInfo> {
        let v = self.get(&format!("/v1/branches/by-name/{}", name)).await?;
        Ok(BranchInfo {
            branch_id: Self::str_field(&v, "branch_id"),
            name: Self::str_field(&v, "name"),
            branch_json: v["branch_json"].as_str().map(str::to_string),
        })
    }

    /// Get the trunk (main) branch.
    pub async fn get_trunk_branch(&self) -> SdkResult<BranchInfo> {
        let v = self.get("/v1/branches/trunk").await?;
        Ok(BranchInfo {
            branch_id: Self::str_field(&v, "branch_id"),
            name: Self::str_field(&v, "name"),
            branch_json: v["branch_json"].as_str().map(str::to_string),
        })
    }

    /// Diff a branch against a target.
    pub async fn diff(&self, source_branch_id: &str, target_branch_id: &str) -> SdkResult<DiffResult> {
        let v = self.get(&format!("/v1/branches/{}/diff?target={}", source_branch_id, target_branch_id)).await?;
        Ok(DiffResult {
            added: v["added"].as_u64().unwrap_or(0) as u32,
            removed: v["removed"].as_u64().unwrap_or(0) as u32,
            modified: v["modified"].as_u64().unwrap_or(0) as u32,
            unchanged: v["unchanged"].as_u64().unwrap_or(0) as u32,
            divergence_score: v["divergence_score"].as_f64().unwrap_or(0.0),
            diff_json: v["diff_json"].as_str().map(str::to_string),
        })
    }

    /// Merge source branch into target.
    pub async fn merge(&self, source_branch_id: &str, target_branch_id: &str, strategy: &str) -> SdkResult<MergeResult> {
        let v = self.post(&format!("/v1/branches/{}/merge", source_branch_id), json!({
            "target_branch_id": target_branch_id,
            "strategy": strategy,
        })).await?;
        Ok(MergeResult {
            success: v["success"].as_bool().unwrap_or(true),
            applied: v["applied"].as_u64().unwrap_or(0) as u32,
            skipped: v["skipped"].as_u64().unwrap_or(0) as u32,
            conflicts: v["conflicts"].as_u64().unwrap_or(0) as u32,
            duration_ms: v["duration_ms"].as_u64().unwrap_or(0),
        })
    }

    /// Discard (delete) a branch.
    pub async fn discard_branch(&self, branch_id: &str) -> SdkResult<bool> {
        let v = self.delete(&format!("/v1/branches/{}", branch_id)).await?;
        Ok(v["discarded"].as_bool().unwrap_or(true))
    }

    /// Archive a branch.
    pub async fn archive_branch(&self, branch_id: &str) -> SdkResult<bool> {
        let v = self.post(&format!("/v1/branches/{}/archive", branch_id), json!({})).await?;
        Ok(v["archived"].as_bool().unwrap_or(true))
    }

    // ─── Sync ────────────────────────────────────────────────────────────

    /// Full bidirectional sync.
    pub async fn sync(&self) -> SdkResult<SyncResult> {
        let v = self.post("/v1/sync", json!({})).await?;
        Ok(SyncResult {
            pushed: v["pushed"].as_u64().unwrap_or(0) as u32,
            pulled: v["pulled"].as_u64().unwrap_or(0) as u32,
            conflicts: v["conflicts"].as_u64().unwrap_or(0) as u32,
            duration_ms: v["duration_ms"].as_u64().unwrap_or(0),
        })
    }

    /// Push local memories to remote.
    pub async fn push_sync(&self) -> SdkResult<SyncActionResult> {
        let v = self.post("/v1/sync/push", json!({})).await?;
        Ok(SyncActionResult { summary_json: Some(v.to_string()) })
    }

    /// Pull remote memories to local.
    pub async fn pull_sync(&self) -> SdkResult<SyncActionResult> {
        let v = self.post("/v1/sync/pull", json!({})).await?;
        Ok(SyncActionResult { summary_json: Some(v.to_string()) })
    }

    /// Reconcile divergent sync state.
    pub async fn reconcile_sync(&self) -> SdkResult<SyncActionResult> {
        let v = self.post("/v1/sync/reconcile", json!({})).await?;
        Ok(SyncActionResult { summary_json: Some(v.to_string()) })
    }

    /// Get current sync status.
    pub async fn sync_status(&self) -> SdkResult<SyncStatusResult> {
        let v = self.get("/v1/sync/status").await?;
        Ok(SyncStatusResult { status_json: Some(v.to_string()) })
    }

    // ─── Reflect ─────────────────────────────────────────────────────────

    /// Trigger a new reflection job.
    pub async fn reflect(&self) -> SdkResult<ReflectJob> {
        let v = self.post("/v1/reflect", json!({ "agent_id": self.inner.agent_id })).await?;
        Ok(ReflectJob {
            job_id: Self::str_field(&v, "job_id"),
            status: Self::str_field(&v, "status"),
            message: v["message"].as_str().map(str::to_string),
            skipped: v["skipped"].as_bool().unwrap_or(false),
        })
    }

    /// List reflection jobs.
    pub async fn reflect_list_jobs(&self, agent_id: &str) -> SdkResult<Vec<ReflectJob>> {
        let v = self.get(&format!("/v1/reflect/jobs?agent_id={}", agent_id)).await?;
        let jobs: Vec<ReflectJob> = Self::extract_array(&v, "jobs");
        Ok(jobs)
    }

    /// Get a specific reflection job.
    pub async fn reflect_get_job(&self, job_id: &str) -> SdkResult<ReflectJob> {
        let v = self.get(&format!("/v1/reflect/jobs/{}", job_id)).await?;
        Ok(ReflectJob {
            job_id: Self::str_field(&v, "job_id"),
            status: Self::str_field(&v, "status"),
            message: v["message"].as_str().map(str::to_string),
            skipped: v["skipped"].as_bool().unwrap_or(false),
        })
    }

    /// Get extracted facts for an agent.
    pub async fn reflect_get_facts(&self, agent_id: &str) -> SdkResult<Value> {
        self.get(&format!("/v1/reflect/facts/{}", agent_id)).await
    }

    /// Get preferences for an agent.
    pub async fn reflect_get_preferences(&self, agent_id: &str) -> SdkResult<Value> {
        self.get(&format!("/v1/reflect/preferences/{}", agent_id)).await
    }

    /// Get contradictions for an agent.
    pub async fn reflect_get_contradictions(&self, agent_id: &str) -> SdkResult<Value> {
        self.get(&format!("/v1/reflect/contradictions/{}", agent_id)).await
    }

    /// Resolve a specific contradiction.
    pub async fn reflect_resolve_contradiction(
        &self,
        agent_id: &str,
        contradiction_id: &str,
        strategy: &str,
        merged_value_json: Option<&str>,
    ) -> SdkResult<Value> {
        self.post(
            &format!("/v1/reflect/contradictions/{}/{}/resolve", agent_id, contradiction_id),
            json!({ "strategy": strategy, "merged_value_json": merged_value_json }),
        ).await
    }

    // ─── Transactions ─────────────────────────────────────────────────────

    /// Begin a new transaction.
    pub async fn begin_tx(&self) -> SdkResult<TxInfo> {
        let v = self.post("/v1/tx", json!({})).await?;
        Ok(TxInfo { tx_id: Self::str_field(&v, "tx_id") })
    }

    /// Add a plain memory to a transaction.
    pub async fn tx_remember(&self, tx_id: &str, content: impl Into<String>) -> SdkResult<String> {
        let v = self.post(&format!("/v1/tx/{}/memories", tx_id), json!({ "content": content.into() })).await?;
        Ok(Self::str_field(&v, "id"))
    }

    /// Add a typed memory to a transaction.
    pub async fn tx_remember_typed(&self, tx_id: &str, content: impl Into<String>, opts: RememberOptions) -> SdkResult<String> {
        let mut body = json!({ "content": content.into() });
        if let Some(mt) = &opts.memory_type { body["type"] = json!(mt); }
        if let Some(tags) = &opts.tags { body["tags"] = json!(tags); }
        let v = self.post(&format!("/v1/tx/{}/memories/typed", tx_id), body).await?;
        Ok(Self::str_field(&v, "id"))
    }

    /// Commit a transaction.
    pub async fn commit_tx(&self, tx_id: &str) -> SdkResult<bool> {
        let v = self.post(&format!("/v1/tx/{}/commit", tx_id), json!({})).await?;
        Ok(v["committed"].as_bool().unwrap_or(true))
    }

    /// Roll back a transaction.
    pub async fn rollback_tx(&self, tx_id: &str) -> SdkResult<bool> {
        let v = self.post(&format!("/v1/tx/{}/rollback", tx_id), json!({})).await?;
        Ok(v["rolled_back"].as_bool().unwrap_or(true))
    }

    /// Close the client (no-op for HTTP).
    pub fn close(&self) {
        info!("clawdb.close");
    }

    /// Return the configured endpoint.
    pub fn endpoint(&self) -> &str {
        &self.inner.endpoint
    }

    /// Return the configured agent_id.
    pub fn agent_id(&self) -> &str {
        &self.inner.agent_id
    }
}

// ─── ClawDBClient alias (legacy compat) ───────────────────────────────────

/// Alias for [`ClawDB`] for backwards compatibility.
#[derive(Clone)]
pub struct ClawDBClient {
    pub(crate) inner: ClawDB,
}

impl ClawDBClient {
    pub async fn auto_provision() -> SdkResult<Self> {
        Ok(Self { inner: ClawDB::auto_provision().await? })
    }

    pub fn builder() -> crate::builder::ClawDBBuilder {
        ClawDB::builder()
    }
}

impl std::ops::Deref for ClawDBClient {
    type Target = ClawDB;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl std::fmt::Debug for ClawDB {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClawDB")
            .field("endpoint", &self.inner.endpoint)
            .field("agent_id", &self.inner.agent_id)
            .finish()
    }
}

impl std::fmt::Debug for ClawDBClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClawDBClient")
            .field("inner", &self.inner)
            .finish()
    }
}

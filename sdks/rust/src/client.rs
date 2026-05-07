use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client as HttpClient, header};
use serde_json::{json, Value};
use tracing::info;
use uuid::Uuid;

use crate::builder::ClawDBBuilder;
use crate::error::{SdkError, SdkResult};
use crate::models::{BranchInfo, DiffResult, MergeResult, SearchHit, SearchOptions, SyncResult};

#[derive(Clone)]
pub struct ClawDBClient {
    inner: ClawDB,
}

#[derive(Clone)]
pub struct ClawDB {
    inner: Arc<ClawDBInner>,
}

struct ClawDBInner {
    endpoint: String,
    api_key: String,
    agent_id: String,
    workspace: String,
    role: String,
    timeout_ms: u64,
    http: HttpClient,
    token: tokio::sync::RwLock<Option<String>>,
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

        let candidates = [
            "clawdb-server".to_string(),
            dirs::home_dir()
                .unwrap_or_default()
                .join(".clawdb/bin/clawdb-server")
                .display()
                .to_string(),
        ];

        for candidate in candidates {
            if std::process::Command::new(&candidate)
                .arg("--port")
                .arg("50050")
                .spawn()
                .is_ok()
            {
                tokio::time::sleep(Duration::from_millis(250)).await;
                return ClawDBBuilder::from_env()
                    .endpoint("http://localhost:50050")
                    .build()
                    .await;
            }
        }

        Err(SdkError::Config("could not auto-provision clawdb-server".into()))
    }

    /// Create a client from an API key and endpoint.
    pub async fn from_api_key(api_key: impl Into<String>, endpoint: impl Into<String>) -> SdkResult<Self> {
        ClawDBBuilder::new()
            .api_key(api_key)
            .endpoint(endpoint)
            .build()
            .await
    }

    pub(crate) async fn new_internal(
        endpoint: String,
        api_key: String,
        agent_id: String,
        workspace: String,
        role: String,
        timeout_ms: u64,
    ) -> SdkResult<Self> {
        let mut default_headers = header::HeaderMap::new();
        if !api_key.is_empty() {
            default_headers.insert(
                "X-Api-Key",
                header::HeaderValue::from_str(&api_key)
                    .map_err(|_| SdkError::Config("Invalid API key characters".into()))?,
            );
        }

        let http = HttpClient::builder()
            .default_headers(default_headers)
            .timeout(std::time::Duration::from_millis(timeout_ms))
            .build()
            .map_err(|e| SdkError::Config(e.to_string()))?;

        Ok(Self {
            inner: Arc::new(ClawDBInner {
                endpoint,
                api_key,
                agent_id,
                workspace,
                role,
                timeout_ms,
                http,
                token: tokio::sync::RwLock::new(None),
            }),
        })
    }

    async fn auth_headers(&self) -> Vec<(String, String)> {
        let token = self.inner.token.read().await;
        if let Some(t) = token.as_deref() {
            vec![("Authorization".into(), format!("Bearer {t}"))]
        } else if !self.inner.api_key.is_empty() {
            vec![("X-Api-Key".into(), self.inner.api_key.clone())]
        } else {
            vec![]
        }
    }

    async fn post(&self, path: &str, body: Value) -> SdkResult<Value> {
        let url = format!("{}{}", self.inner.endpoint, path);
        let mut req = self.inner.http.post(&url).json(&body);
        for (k, v) in self.auth_headers().await {
            req = req.header(k, v);
        }
        let resp = req.send().await.map_err(|e| SdkError::Reqwest(e))?;
        let status = resp.status().as_u16();
        let text = resp.text().await.map_err(|e| SdkError::Reqwest(e))?;
        if status >= 400 {
            return Err(SdkError::from_http(status, &text));
        }
        serde_json::from_str(&text).map_err(SdkError::Serialization)
    }

    /// Store a memory in ClawDB.
    pub async fn remember(&self, content: impl Into<String>) -> SdkResult<Uuid> {
        let content = content.into();
        if content.trim().is_empty() {
            return Err(SdkError::Validation {
                field: "content".into(),
                constraint: "must be non-empty".into(),
            });
        }
        let resp = self.post("/v1/memory/remember", json!({"content": content, "agent_id": self.inner.agent_id})).await?;
        let id_str = resp["memory_id"].as_str().unwrap_or_default();
        Uuid::parse_str(id_str).map_err(|_| SdkError::Internal("Invalid UUID in response".into()))
    }

    /// Search memories semantically.
    pub async fn search(&self, query: impl Into<String>, opts: SearchOptions) -> SdkResult<Vec<SearchHit>> {
        let query = query.into();
        let top_k = opts.top_k.unwrap_or(5);
        if top_k > 100 {
            return Err(SdkError::Validation { field: "top_k".into(), constraint: "must be <= 100".into() });
        }
        let resp = self.post("/v1/memory/search", json!({"query": query, "top_k": top_k, "semantic": opts.semantic.unwrap_or(true), "alpha": opts.alpha.unwrap_or(0.7)})).await?;
        let results: Vec<SearchHit> = serde_json::from_value(resp["results"].clone())?;
        Ok(results)
    }

    /// Search and return only the top result content.
    pub async fn search_top_k(&self, query: impl Into<String>, k: u32) -> SdkResult<Vec<String>> {
        let results = self.search(query, SearchOptions { top_k: Some(k), ..Default::default() }).await?;
        Ok(results.into_iter().map(|r| r.content).collect())
    }

    /// Fork a new memory branch.
    pub async fn fork(&self, name: impl Into<String>, parent: Option<&str>) -> SdkResult<BranchInfo> {
        let resp = self.post("/v1/branches/fork", json!({"name": name.into(), "parent": parent.unwrap_or("trunk")})).await?;
        Ok(serde_json::from_value(resp["branch"].clone())?)
    }

    /// Merge a branch into a target.
    pub async fn merge(&self, source: impl Into<String>, into: &str, strategy: &str) -> SdkResult<MergeResult> {
        let resp = self.post("/v1/branches/merge", json!({"source": source.into(), "into": into, "strategy": strategy})).await?;
        Ok(serde_json::from_value(resp)?)
    }

    /// Diff two branches.
    pub async fn diff(&self, branch_a: &str, branch_b: &str) -> SdkResult<DiffResult> {
        let resp = self.post("/v1/branches/diff", json!({"branch_a": branch_a, "branch_b": branch_b})).await?;
        Ok(serde_json::from_value(resp)?)
    }

    /// Push memories to ClawDB Cloud.
    pub async fn sync_push(&self) -> SdkResult<SyncResult> {
        let resp = self.post("/v1/sync/push", json!({})).await?;
        Ok(serde_json::from_value(resp)?)
    }

    /// Trigger a reflection job.
    pub async fn reflect(&self, job_type: &str) -> SdkResult<String> {
        let resp = self.post("/v1/reflect/trigger", json!({"job_type": job_type})).await?;
        Ok(resp["job_id"].as_str().unwrap_or_default().to_string())
    }

    /// Close the client (no-op for HTTP; placeholder for gRPC future).
    pub async fn close(&self) {
        info!("clawdb.close");
    }
}

impl ClawDBClient {
    /// Auto-provision a client endpoint.
    pub async fn auto_provision() -> SdkResult<Self> {
        Ok(Self {
            inner: ClawDB::auto_provision().await?,
        })
    }

    /// Create a builder for constructing a client.
    pub fn builder() -> ClientBuilder {
        ClientBuilder { inner: ClawDBBuilder::new() }
    }

    /// Access the memory namespace.
    pub fn memory(&self) -> MemoryNamespace {
        MemoryNamespace { client: self.inner.clone() }
    }

    /// Close the client.
    pub async fn close(&self) {
        self.inner.close().await;
    }
}

/// Builder for [`ClawDBClient`].
pub struct ClientBuilder {
    inner: ClawDBBuilder,
}

impl ClientBuilder {
    /// Set the endpoint.
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.inner = self.inner.endpoint(endpoint);
        self
    }

    /// Set the agent id.
    pub fn agent_id(mut self, agent_id: impl Into<String>) -> Self {
        self.inner = self.inner.agent_id(agent_id);
        self
    }

    /// Build the client.
    pub async fn build(self) -> SdkResult<ClawDBClient> {
        Ok(ClawDBClient { inner: self.inner.build().await? })
    }
}

/// Memory namespace entrypoint.
pub struct MemoryNamespace {
    client: ClawDB,
}

impl MemoryNamespace {
    /// Remember content using a fluent builder.
    pub fn remember(&self, content: impl Into<String>) -> RememberCall {
        RememberCall { client: self.client.clone(), content: content.into() }
    }

    /// Search memories using a fluent builder.
    pub fn search(&self, query: impl Into<String>) -> SearchCall {
        SearchCall { client: self.client.clone(), query: query.into(), opts: SearchOptions::default() }
    }
}

/// Fluent remember call builder.
pub struct RememberCall {
    client: ClawDB,
    content: String,
}

impl RememberCall {
    /// Execute the remember call.
    pub async fn await_result(self) -> SdkResult<Uuid> {
        self.client.remember(self.content).await
    }
}

impl std::future::IntoFuture for RememberCall {
    type Output = SdkResult<Uuid>;
    type IntoFuture = std::pin::Pin<Box<dyn std::future::Future<Output = Self::Output> + Send>>;

    fn into_future(self) -> Self::IntoFuture {
        Box::pin(async move { self.client.remember(self.content).await })
    }
}

/// Fluent memory search builder.
pub struct SearchCall {
    client: ClawDB,
    query: String,
    opts: SearchOptions,
}

impl SearchCall {
    /// Set the maximum number of hits.
    pub fn top_k(mut self, top_k: u32) -> Self {
        self.opts.top_k = Some(top_k);
        self
    }

    /// Execute the search call.
    pub async fn call(self) -> SdkResult<Vec<SearchHit>> {
        self.client.search(self.query, self.opts).await
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

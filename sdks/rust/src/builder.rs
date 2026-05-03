use std::env;
use std::path::PathBuf;

use crate::client::ClawDB;
use crate::error::{SdkError, SdkResult};

/// Builder for constructing a [`ClawDB`] client.
#[derive(Debug, Default)]
pub struct ClawDBBuilder {
    endpoint: Option<String>,
    api_key: Option<String>,
    agent_id: Option<String>,
    workspace: Option<String>,
    role: Option<String>,
    timeout_ms: Option<u64>,
    tls: Option<bool>,
}

impl ClawDBBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = Some(endpoint.into());
        self
    }

    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn agent_id(mut self, agent_id: impl Into<String>) -> Self {
        self.agent_id = Some(agent_id.into());
        self
    }

    pub fn workspace(mut self, workspace: impl Into<String>) -> Self {
        self.workspace = Some(workspace.into());
        self
    }

    pub fn role(mut self, role: impl Into<String>) -> Self {
        self.role = Some(role.into());
        self
    }

    pub fn timeout_ms(mut self, ms: u64) -> Self {
        self.timeout_ms = Some(ms);
        self
    }

    pub fn tls(mut self, enabled: bool) -> Self {
        self.tls = Some(enabled);
        self
    }

    /// Populate from environment variables.
    pub fn from_env() -> Self {
        Self {
            endpoint: env::var("CLAWDB_ENDPOINT").ok(),
            api_key: env::var("CLAWDB_API_KEY").ok(),
            agent_id: env::var("CLAWDB_AGENT_ID").ok(),
            workspace: env::var("CLAWDB_WORKSPACE").ok(),
            role: env::var("CLAWDB_ROLE").ok(),
            timeout_ms: env::var("CLAWDB_TIMEOUT_MS").ok().and_then(|v| v.parse().ok()),
            tls: env::var("CLAWDB_TLS").ok().map(|v| v == "true" || v == "1"),
        }
    }

    /// Build the [`ClawDB`] client.
    pub async fn build(self) -> SdkResult<ClawDB> {
        let endpoint = self.endpoint.unwrap_or_else(|| "http://localhost:50050".into());
        let api_key = self.api_key.unwrap_or_default();
        let agent_id = self.agent_id.unwrap_or_else(|| "default-agent".into());
        let workspace = self.workspace.unwrap_or_else(|| "default".into());
        let role = self.role.unwrap_or_else(|| "assistant".into());
        let timeout_ms = self.timeout_ms.unwrap_or(30_000);

        // Validate endpoint URL
        let _ = url::Url::parse(&endpoint).map_err(|e| SdkError::InvalidUrl(e))?;

        ClawDB::new_internal(endpoint, api_key, agent_id, workspace, role, timeout_ms).await
    }
}

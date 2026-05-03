use thiserror::Error;

/// All errors that can be returned by the ClawDB Rust SDK.
#[derive(Debug, Error)]
pub enum SdkError {
    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Access denied: {resource}/{action}")]
    AccessDenied { resource: String, action: String },

    #[error("{entity_type} not found: {entity_id}")]
    NotFound { entity_type: String, entity_id: String },

    #[error("Rate limited; retry after {retry_after_ms}ms")]
    RateLimit { retry_after_ms: u64 },

    #[error("Service unavailable: {0}")]
    Unavailable(String),

    #[error("Request timed out after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },

    #[error("Validation error on field `{field}`: {constraint}")]
    Validation { field: String, constraint: String },

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("HTTP error {status}: {body}")]
    Http { status: u16, body: String },

    #[error("JSON error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Invalid URL: {0}")]
    InvalidUrl(#[from] url::ParseError),

    #[error("Internal error: {0}")]
    Internal(String),

    #[cfg(feature = "http")]
    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),
}

/// Convenience type alias.
pub type SdkResult<T> = Result<T, SdkError>;

impl SdkError {
    /// Whether the error is retriable.
    pub fn is_retriable(&self) -> bool {
        matches!(self, SdkError::Unavailable(_) | SdkError::RateLimit { .. })
    }

    /// Maps an HTTP status code and body text to an SdkError.
    pub fn from_http(status: u16, body: &str) -> Self {
        match status {
            401 | 403 => SdkError::Auth(body.to_string()),
            404 => SdkError::NotFound {
                entity_type: "entity".into(),
                entity_id: "unknown".into(),
            },
            429 => SdkError::RateLimit { retry_after_ms: 1000 },
            503 => SdkError::Unavailable(body.to_string()),
            408 | 504 => SdkError::Timeout { timeout_ms: 30000 },
            400 | 422 => SdkError::Validation {
                field: "input".into(),
                constraint: body.to_string(),
            },
            _ => SdkError::Http {
                status,
                body: body.to_string(),
            },
        }
    }
}

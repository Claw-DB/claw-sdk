use clawdb_sdk::{ClawDBBuilder, SdkError};

#[tokio::test]
async fn test_builder_defaults() {
    let result = ClawDBBuilder::new().endpoint("http://localhost:50050").build().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_builder_from_env() {
    // Should succeed even if env vars are unset (falls back to defaults)
    std::env::remove_var("CLAWDB_API_KEY");
    let result = ClawDBBuilder::from_env().endpoint("http://localhost:50050").build().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_invalid_url_rejected() {
    let result = ClawDBBuilder::new().endpoint("not a url !!").build().await;
    assert!(matches!(result, Err(SdkError::InvalidUrl(_))));
}

#[tokio::test]
async fn test_remember_empty_content() {
    let db = ClawDBBuilder::new()
        .endpoint("http://localhost:50050")
        .build()
        .await
        .unwrap();
    let result = db.remember("").await;
    assert!(matches!(result, Err(SdkError::Validation { field, .. }) if field == "content"));
}

#[tokio::test]
async fn test_sdk_error_is_retriable() {
    assert!(SdkError::Unavailable("down".into()).is_retriable());
    assert!(SdkError::RateLimit { retry_after_ms: 1000 }.is_retriable());
    assert!(!SdkError::Auth("bad key".into()).is_retriable());
}

#[tokio::test]
async fn test_from_http_401() {
    let err = SdkError::from_http(401, "Unauthorized");
    assert!(matches!(err, SdkError::Auth(_)));
}

#[tokio::test]
async fn test_from_http_404() {
    let err = SdkError::from_http(404, "not found");
    assert!(matches!(err, SdkError::NotFound { .. }));
}

#[tokio::test]
async fn test_from_http_429() {
    let err = SdkError::from_http(429, "too many requests");
    assert!(matches!(err, SdkError::RateLimit { .. }));
}

#[tokio::test]
async fn test_from_http_503() {
    let err = SdkError::from_http(503, "service unavailable");
    assert!(matches!(err, SdkError::Unavailable(_)));
}

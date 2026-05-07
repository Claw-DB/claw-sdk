//! # ClawDB Rust Client
//!
//! Official Rust SDK for [ClawDB](https://clawdb.io) — the cognitive database for AI agents.
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use clawdb_client::ClawDBClient;
//!
//! #[tokio::main]
//! async fn main() -> clawdb_client::Result<()> {
//!     let db = ClawDBClient::auto_provision().await?;
//!
//!     // Store a memory
//!     let id = db.remember("The user prefers concise answers").await?;
//!     println!("Stored: {id}");
//!
//!     // Search semantically
//!     let results = db.search("user preferences", Default::default()).await?;
//!     for r in results {
//!         println!("  [{:.2}] {}", r.score, r.content);
//!     }
//!
//!     db.close();
//!     Ok(())
//! }
//! ```

pub mod builder;
pub mod client;
pub mod error;
pub mod models;

pub use builder::ClawDBBuilder;
pub use client::{ClawDB, ClawDBClient};
pub use error::{SdkError, SdkResult};
pub use models::{
    BranchInfo, DiffResult, HealthResponse, MemoryRecord, MemoryType, MergeResult, ReflectJob,
    RememberOptions, SearchHit, SearchOptions, SessionInfo, SyncActionResult, SyncResult,
    SyncStatusResult, TxInfo,
};

pub type Result<T> = SdkResult<T>;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Prelude — import this for the most commonly used types.
pub mod prelude {
    pub use crate::{ClawDBClient, Result, SdkError, SdkResult, SearchOptions};
}

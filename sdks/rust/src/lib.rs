//! # ClawDB Rust SDK
//!
//! Official Rust SDK for [ClawDB](https://clawdb.io) — the cognitive database for AI agents.
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use clawdb_sdk::{ClawDB, SearchOptions};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let db = ClawDB::from_env().await?;
//!
//!     // Store a memory
//!     let id = db.remember("The user prefers concise answers").await?;
//!     println!("Stored: {id}");
//!
//!     // Search semantically
//!     let results = db.search("user preferences", SearchOptions::default()).await?;
//!     for r in results {
//!         println!("  [{:.2}] {}", r.score, r.memory.content);
//!     }
//!
//!     db.close().await;
//!     Ok(())
//! }
//! ```

pub mod builder;
pub mod client;
pub mod error;
pub mod models;

pub use builder::ClawDBBuilder;
pub use client::ClawDB;
pub use error::{SdkError, SdkResult};
pub use models::{
    BranchInfo, DiffResult, MemoryRecord, MemoryType, MergeResult, RememberOptions, SearchOptions,
    SearchResult, SyncResult,
};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Prelude — import this for the most commonly used types.
pub mod prelude {
    pub use crate::{ClawDB, SdkError, SdkResult, SearchOptions};
}

# clawdb-client

Official Rust client for ClawDB.

## Install

```toml
[dependencies]
clawdb-client = "0.1.0"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Quick Start

```rust
use clawdb_client::{ClawDBBuilder, Result};

#[tokio::main]
async fn main() -> Result<()> {
    let db = ClawDBBuilder::new()
        .endpoint("http://localhost:50050")
        .agent_id("rust-agent")
        .build()
        .await?;

    let memory_id = db.remember_typed("Track the weekly release checklist", None).await?;
    let hits = db.search("release checklist", None).await?;
    let branch = db.branch("release-dry-run", None).await?;

    println!("{} {} {}", memory_id, hits.len(), branch.id);
    Ok(())
}
```

## API Surface

The Rust client covers:
- health and readiness
- session create, validate, revoke, and count
- memory remember, typed remember, update, search, recall, list, and delete
- branch fork, lookup, diff, merge, discard, and archive
- sync run, push, pull, reconcile, and status
- reflection jobs, facts, preferences, contradictions, and resolution
- transaction begin, remember, typed remember, commit, and rollback

## Configuration

Builder fields:
- `endpoint()`
- `api_key()`
- `agent_id()`
- `workspace()`
- `role()`
- `timeout_ms()`
- `tls()`

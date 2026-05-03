# clawdb (Rust SDK)

The official Rust client for **ClawDB** — persistent, branchable, semantically-searchable agent memory.

```toml
[dependencies]
clawdb = "0.1"
tokio = { version = "1", features = ["full"] }
```

## Quick start

```rust
use clawdb::Client;

#[tokio::main]
async fn main() -> clawdb::Result<()> {
    let db = Client::builder()
        .endpoint("http://localhost:50050")
        .agent_id("my-agent")
        .build()
        .await?;

    // Store a memory
    let id = db.memory()
        .remember("Deploy at 3 PM UTC")
        .memory_type("task")
        .tags(["ops", "deploy"])
        .call()
        .await?;

    // Search
    let results = db.memory()
        .search("deploy schedule")
        .top_k(5)
        .call()
        .await?;

    for result in &results {
        println!("{:.3}  {}", result.score, result.memory.content);
    }

    // Recall
    let memories = db.memory().recall(&[&id]).call().await?;

    // Forget
    db.memory().forget(&id).call().await?;

    Ok(())
}
```

## Branches

```rust
let branch = db.branches().fork("my-experiment").call().await?;
db.branches()
    .merge("my-experiment")
    .into_branch("trunk")
    .strategy(MergeStrategy::Union)
    .call()
    .await?;
```

## Configuration

```rust
let db = Client::builder()
    .endpoint("http://localhost:50050")
    .api_key("ck_live_...")
    .agent_id("my-agent")
    .timeout(std::time::Duration::from_secs(30))
    .tls(false)
    .build()
    .await?;
```

Or set `CLAWDB_ENDPOINT`, `CLAWDB_API_KEY`, `CLAWDB_AGENT_ID` env vars and call `Client::from_env().await?`.

## Docs

Full API reference: <https://docs.rs/clawdb>

## Development

```bash
cd sdks/rust
cargo test
cargo clippy
```

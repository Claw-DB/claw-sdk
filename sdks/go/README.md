# clawdb (Go SDK)

The official Go client for **ClawDB**.

This package is a gRPC client to `clawdb-server`. It does not embed the Rust runtime directly into your Go process.

```bash
go get github.com/Claw-DB/claw-sdk/sdks/go
```

For local usage, start `clawdb-server` first. The expected zero-config path is:

```bash
npx @clawdb/cli@latest init
```

If you already have a local or hosted deployment, set the endpoint explicitly.

## Quick start

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/Claw-DB/claw-sdk/sdks/go"
)

func main() {
    db, err := clawdb.New(clawdb.Options{
        Endpoint: "http://localhost:50050",
        AgentID:  "my-agent",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    ctx := context.Background()

    // Store a memory
    id, err := db.Memory.Remember(ctx, "Deploy at 3 PM UTC", &clawdb.RememberOptions{
        MemoryType: "task",
        Tags:       []string{"ops", "deploy"},
    })
    if err != nil {
        log.Fatal(err)
    }

    // Search
    results, err := db.Memory.Search(ctx, "deploy schedule", &clawdb.SearchOptions{TopK: 5})
    if err != nil {
        log.Fatal(err)
    }
    for _, r := range results {
        fmt.Printf("%.3f  %s\n", r.Score, r.Memory.Content)
    }

    // Recall
    memories, _ := db.Memory.Recall(ctx, []string{id})
    _ = memories

    // Forget
    _ = db.Memory.Forget(ctx, id)
}
```

## Branches

```go
branch, _ := db.Branches.Fork(ctx, "my-experiment", nil)
_ = branch

db.Branches.Merge(ctx, "my-experiment", &clawdb.MergeOptions{
    Into:     "trunk",
    Strategy: clawdb.MergeStrategyUnion,
})
```

## Configuration

| Option | Env var | Description |
|---|---|---|
| `Endpoint` | `CLAWDB_ENDPOINT` | gRPC server address |
| `APIKey` | `CLAWDB_API_KEY` | API key |
| `AgentID` | `CLAWDB_AGENT_ID` | Agent identifier |
| `TimeoutMs` | `CLAWDB_TIMEOUT_MS` | Request timeout |

Use `clawdb.NewFromEnv()` to read from environment variables automatically.

## Runtime model

- Go talks to `clawdb-server` over gRPC.
- `clawdb-server` hosts the Rust runtime and storage engine.
- For cloud usage, point `CLAWDB_ENDPOINT` at the managed endpoint and supply `CLAWDB_API_KEY`.

## Docs

Full API reference: <https://pkg.go.dev/github.com/Claw-DB/claw-sdk/sdks/go>

## Development

```bash
cd sdks/go
go test ./... -race
go vet ./...
```

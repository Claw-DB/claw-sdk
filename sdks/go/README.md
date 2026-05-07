# github.com/Claw-DB/claw-sdk/sdks/go

Official Go client for ClawDB.

## Install

```bash
go get github.com/Claw-DB/claw-sdk/sdks/go
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"

    clawdb "github.com/Claw-DB/claw-sdk/sdks/go"
)

func main() {
    client, err := clawdb.New(clawdb.Options{
        Endpoint: "http://localhost:50050",
        AgentID:  "go-agent",
    })
    if err != nil {
        panic(err)
    }
    defer client.Close()

    ctx := context.Background()
    memoryID, _ := client.RememberTyped(ctx, "Publish the changelog on Friday", &clawdb.RememberOptions{Type: "task"})
    hits, _ := client.Search(ctx, "changelog", &clawdb.SearchOptions{TopK: 5, Semantic: true})
    branch, _ := client.Branch(ctx, "release-dry-run", "")

    fmt.Println(memoryID, len(hits), branch.ID)
}
```

## API Surface

The Go client covers:
- health and readiness
- session lifecycle
- memory CRUD, search, recall, and listing
- branch fork, lookup, diff, merge, discard, and archive
- sync run, push, pull, reconcile, and status
- reflection jobs and contradiction resolution
- transaction begin, remember, typed remember, commit, and rollback

# clawdb

Official Python client for ClawDB with sync and async APIs.

## Install

```bash
pip install clawdb
```

Optional async extras:

```bash
pip install "clawdb[async]"
```

## Quick Start

```python
from clawdb import ClawDB

db = ClawDB(endpoint="http://localhost:50050", agent_id="py-agent")

memory_id = db.remember_typed("Customer prefers weekly updates", type="context", tags=["customer"])
hits = db.search("weekly updates", top_k=5, semantic=True)
branch = db.branch("customer-experiment")

print(memory_id, len(hits), branch.id)
```

## Client Variants

- `ClawDB` for synchronous code
- `AsyncClawDB` for asyncio applications
- `clawdb()` helper for environment-aware client creation

## API Surface

The Python SDK covers:
- health and readiness
- session lifecycle
- memory CRUD, search, recall, and listing
- branch fork, inspect, diff, merge, discard, and archive
- sync run, push, pull, reconcile, and status
- reflection run, jobs, facts, preferences, contradictions, and resolution
- transaction begin, remember, typed remember, commit, and rollback

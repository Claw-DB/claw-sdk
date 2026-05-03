# clawdb (Python SDK)

The official Python client for **ClawDB** — persistent, branchable, semantically-searchable agent memory.

```bash
pip install clawdb
```

## Sync usage

```python
from clawdb import ClawDB

db = ClawDB(endpoint="http://localhost:50050", agent_id="my-agent")

# Store a memory
id = db.memory.remember("Deploy at 3 PM UTC", memory_type="task", tags=["ops"])

# Search
results = db.memory.search("deploy schedule", top_k=5)
for r in results:
    print(f"{r.score:.3f}  {r.memory.content}")

# Recall by ID
memories = db.memory.recall([id])

# Forget
db.memory.forget(id)
```

## Async usage

```python
import asyncio
from clawdb.aio import AsyncClawDB

async def main():
    async with AsyncClawDB(endpoint="http://localhost:50050") as db:
        id = await db.memory.remember("Async test")
        results = await db.memory.search("test")

asyncio.run(main())
```

## Branches

```python
branch = db.branches.fork("my-experiment")
db.memory.remember("hypothesis", tags=["experiment"])  # writes to current branch
db.branches.merge("my-experiment", into="trunk")
```

## LangChain integration

```python
from clawdb.langchain import ClawDBRetriever
retriever = ClawDBRetriever(db=db, top_k=10)
docs = retriever.get_relevant_documents("deploy schedule")
```

## Configuration

| Env var | Description |
|---|---|
| `CLAWDB_ENDPOINT` | gRPC endpoint (default `http://localhost:50050`) |
| `CLAWDB_API_KEY` | API key (`ck_live_...` or `ck_test_...`) |
| `CLAWDB_AGENT_ID` | Agent identifier |

## Development

```bash
pip install -e ".[dev]"
pytest
```


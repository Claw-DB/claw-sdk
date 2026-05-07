# @clawdb/mcp-adapter

Model Context Protocol server for exposing ClawDB over stdio.

## Install

```bash
npx -y @clawdb/mcp-adapter
```

## Claude Desktop

```bash
npx -y @clawdb/mcp-adapter --print-config
npx -y @clawdb/mcp-adapter --install-claude
```

## Environment

- `CLAWDB_ENDPOINT` or `CLAWDB_URL`
- `CLAWDB_API_KEY`
- `CLAWDB_AGENT_ID`

## Tools

Memory:
- `clawdb_remember`
- `clawdb_remember_bulk`
- `clawdb_search`
- `clawdb_update_memory`
- `clawdb_delete_memory`
- `clawdb_list_memories`
- `clawdb_recall`

Branches:
- `clawdb_branch_fork`
- `clawdb_branch_merge`
- `clawdb_branch_list`
- `clawdb_branch_get`
- `clawdb_branch_trunk`
- `clawdb_branch_diff`
- `clawdb_branch_discard`
- `clawdb_branch_archive`

Sync, reflection, and transactions:
- `clawdb_sync`, `clawdb_sync_push`, `clawdb_sync_pull`, `clawdb_sync_reconcile`, `clawdb_sync_status`
- `clawdb_reflect`, `clawdb_reflect_list_jobs`, `clawdb_reflect_get_job`, `clawdb_reflect_facts`, `clawdb_reflect_preferences`, `clawdb_reflect_contradictions`, `clawdb_reflect_resolve_contradiction`
- `clawdb_tx_begin`, `clawdb_tx_remember`, `clawdb_tx_remember_typed`, `clawdb_tx_commit`, `clawdb_tx_rollback`

Additional utility:
- `clawdb_status`
- resources `clawdb://recent` and `clawdb://memory/{id}`
- prompt `clawdb_load_context`

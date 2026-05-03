# @clawdb/mcp-adapter

Model Context Protocol server adapter for ClawDB over stdio.

## Install

npm:

npm install -g @clawdb/mcp-adapter

pnpm:

pnpm add -g @clawdb/mcp-adapter

## Run

clawdb-mcp

Environment variables:

- CLAWDB_ENDPOINT
- CLAWDB_API_KEY
- CLAWDB_AGENT_ID

## Claude Desktop config

```json
{
  "mcpServers": {
    "clawdb": {
      "command": "npx",
      "args": ["-y", "@clawdb/mcp-adapter"],
      "env": {
        "CLAWDB_ENDPOINT": "http://localhost:50050",
        "CLAWDB_AGENT_ID": "agent-1"
      }
    }
  }
}
```

## Registered tools

- clawdb_remember
- clawdb_search
- clawdb_recall
- clawdb_forget
- clawdb_branch_fork
- clawdb_branch_list
- clawdb_branch_diff
- clawdb_branch_merge
- clawdb_sync
- clawdb_reflect
- clawdb_status

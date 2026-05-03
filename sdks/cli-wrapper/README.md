# @clawdb/cli

The official CLI for **ClawDB** — persistent, branchable, semantically-searchable agent memory.

```bash
npm install -g @clawdb/cli
```

## Commands

### Auth

```bash
clawdb auth login                   # Authenticate and save credentials
clawdb auth logout                  # Remove stored credentials
clawdb auth whoami                  # Show current identity
clawdb auth token                   # Print the current session token
```

### Init

```bash
clawdb init                         # Interactive setup wizard (creates ~/.clawdb/config.toml)
clawdb init --non-interactive       # Use env vars, skip prompts
```

### Memory

```bash
clawdb memory add "Your text here"                   # Store a memory
clawdb memory add "text" --type task --tag ops       # With type and tag
clawdb memory search "deploy schedule" --top-k 10   # Semantic search
clawdb memory get <id>                               # Recall by ID
clawdb memory delete <id>                            # Soft-delete
clawdb memory list --tag ops                         # List with filter
clawdb memory repl                                   # Interactive REPL
```

### Branches

```bash
clawdb branch list                  # List all branches
clawdb branch fork <name>           # Fork a new branch
clawdb branch diff <a> <b>          # Diff two branches
clawdb branch merge <source>        # Merge into trunk
clawdb branch delete <name>         # Delete a branch
```

### Sync

```bash
clawdb sync                         # Push + pull
clawdb sync push                    # Push only
clawdb sync pull                    # Pull only
clawdb sync status                  # Show sync status
```

### Reflect

```bash
clawdb reflect run                  # Trigger a memory consolidation job
clawdb reflect status               # Check last job status
clawdb reflect profile              # Show memory profile / stats
```

### Config

```bash
clawdb config get                   # Print current config
clawdb config set endpoint http://localhost:50050
clawdb config validate              # Validate config file
clawdb config reset                 # Reset to defaults
```

### Status

```bash
clawdb status                       # Health check + connected agent info
```

### Dev

```bash
clawdb dev start                    # Start local clawdb-server via Docker
clawdb dev stop                     # Stop it
clawdb dev logs                     # Tail server logs
clawdb dev reset                    # Wipe local data
```

## Shell completion

```bash
# Bash
clawdb completion bash >> ~/.bashrc

# Zsh
clawdb completion zsh >> ~/.zshrc

# Fish
clawdb completion fish > ~/.config/fish/completions/clawdb.fish
```

## Config file

Stored at `~/.clawdb/config.toml`:

```toml
endpoint = "http://localhost:50050"
api_key  = "ck_live_..."
agent_id = "my-agent"
workspace = "default"
log_level = "info"
timeout_ms = 30000

[sync]
hub_url = "https://sync.clawdb.io"
interval_secs = 300

[reflect]
service_url = "https://reflect.clawdb.io"
```

## Environment variables

All settings can be overridden via env vars: `CLAWDB_ENDPOINT`, `CLAWDB_API_KEY`, `CLAWDB_AGENT_ID`, etc.

// Package clawdb is the official Go SDK for ClawDB — the cognitive database for AI agents.
//
// Quick start:
//
//	db, err := clawdb.New(clawdb.WithAPIKey("sk-..."), clawdb.WithEndpoint("https://api.clawdb.io"))
//	if err != nil { log.Fatal(err) }
//	defer db.Close()
//
//	id, err := db.Memory().Remember(ctx, "User prefers dark mode", nil)
package clawdb

// Version is the current SDK version.
const Version = "0.1.0"

// ClawDB is the top-level client.
type ClawDB struct {
	cfg     *Config
	session *Session

	memory   *MemoryClient
	branches *BranchesClient
	sync     *SyncClient
	reflect  *ReflectClient
}

// New creates a ClawDB client with the given options.
func New(opts ...Option) (*ClawDB, error) {
	cfg := LoadConfig()
	for _, o := range opts {
		o(cfg)
	}
	db := &ClawDB{cfg: cfg}
	db.memory = newMemoryClient(cfg, db.session)
	db.branches = newBranchesClient(cfg, db.session)
	db.sync = newSyncClient(cfg, db.session)
	db.reflect = newReflectClient(cfg, db.session)
	return db, nil
}

// FromEnv creates a ClawDB client from environment variables.
func FromEnv() (*ClawDB, error) {
	return New()
}

// FromAPIKey creates a ClawDB client with an explicit API key and endpoint.
func FromAPIKey(apiKey, endpoint string) (*ClawDB, error) {
	return New(WithAPIKey(apiKey), WithEndpoint(endpoint))
}

// Memory returns the MemoryClient.
func (db *ClawDB) Memory() *MemoryClient { return db.memory }

// Branches returns the BranchesClient.
func (db *ClawDB) Branches() *BranchesClient { return db.branches }

// Sync returns the SyncClient.
func (db *ClawDB) Sync() *SyncClient { return db.sync }

// Reflect returns the ReflectClient.
func (db *ClawDB) Reflect() *ReflectClient { return db.reflect }

// Close releases any held resources.
func (db *ClawDB) Close() {}

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
const Version = "0.1.1"

// ClawDB is the top-level client.
type ClawDB struct {
	cfg     *Config
	session *Session

	Memory        *MemoryClient
	Branch        *BranchesClient
	Sync          *SyncClient
	Reflect       *ReflectClient
	SessionClient *SessionClient
	Health        *HealthClient
}

// New creates a ClawDB client from an optional Options struct or functional options.
func New(args ...interface{}) (*ClawDB, error) {
	cfg := LoadConfig()
	for _, arg := range args {
		switch value := arg.(type) {
		case Option:
			value(cfg)
		case Options:
			applyOptionsStruct(cfg, value)
		case *Options:
			if value != nil {
				applyOptionsStruct(cfg, *value)
			}
		}
	}
	if err := autoProvisionEndpoint(cfg); err != nil {
		return nil, err
	}
	db := &ClawDB{cfg: cfg}
	db.Memory = newMemoryClient(cfg, db.session)
	db.Branch = newBranchesClient(cfg, db.session)
	db.Sync = newSyncClient(cfg, db.session)
	db.Reflect = newReflectClient(cfg, db.session)
	db.SessionClient = newSessionClient(cfg, db.session)
	db.Health = newHealthClient(cfg)
	return db, nil
}

// FromEnv creates a ClawDB client from environment variables.
func FromEnv() (*ClawDB, error) {
	return New()
}

// FromAPIKey creates a ClawDB client with an explicit API key and endpoint.
func FromAPIKey(apiKey, endpoint string) (*ClawDB, error) {
	return New(Options{APIKey: apiKey, Endpoint: endpoint})
}

// Memory returns the MemoryClient.
func (db *ClawDB) MemoryClient() *MemoryClient { return db.Memory }

// Branches returns the BranchesClient.
func (db *ClawDB) Branches() *BranchesClient { return db.Branch }

// Sync returns the SyncClient.
func (db *ClawDB) SyncClient() *SyncClient { return db.Sync }

// Reflect returns the ReflectClient.
func (db *ClawDB) ReflectClient() *ReflectClient { return db.Reflect }

// Close releases any held resources.
func (db *ClawDB) Close() {}

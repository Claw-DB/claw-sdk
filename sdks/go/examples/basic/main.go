package main

import (
	"context"
	"fmt"
	"log"

	clawdb "github.com/Claw-DB/claw-sdk/sdks/go"
)

func main() {
	db, err := clawdb.FromEnv()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	// Store a memory
	id, err := db.Memory.Remember(ctx, "The user prefers concise answers", &clawdb.RememberOptions{
		MemoryType: clawdb.MemoryTypeContext,
		Tags:       []string{"preferences"},
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Stored memory: %s\n", id)

	// Search semantically
	results, err := db.Memory.Search(ctx, "user preferences", &clawdb.SearchOptions{TopK: 5, Semantic: true})
	if err != nil {
		log.Fatal(err)
	}
	for _, r := range results {
		fmt.Printf("  [%.2f] %s\n", r.Score, r.Content)
	}
}

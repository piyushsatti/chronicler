package graph

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	gqlparser "github.com/vektah/gqlparser/v2"
)

func TestAcknowledgeSuppressedNotificationsRequiresCommands(t *testing.T) {
	r := &Resolver{Services: Services{}}
	receipt, err := r.Mutation().AcknowledgeSuppressedNotifications(context.Background(), 10, CommandMeta{
		IdempotencyKey: "test-ack-suppressed",
	})
	if receipt != nil {
		t.Fatalf("receipt = %#v, want nil", receipt)
	}
	if err == nil {
		t.Fatal("expected unavailable commands error")
	}
	if strings.Contains(err.Error(), "not available") {
		t.Fatalf("interim not-available path remains: %v", err)
	}
}

func TestFrontendOperationsMatchServerGraphQLValidator(t *testing.T) {
	schema := NewExecutableSchema(Config{}).Schema()
	root := filepath.Join("..", "..", "..", "web", "src")
	documents := 0
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".graphql" {
			return nil
		}
		documents++
		name, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		t.Run(filepath.ToSlash(name), func(t *testing.T) {
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, failures := gqlparser.LoadQuery(schema, string(raw)); len(failures) != 0 {
				t.Fatal(failures)
			}
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if documents == 0 {
		t.Fatal("no frontend operation documents found")
	}
	t.Logf("validated %d actual frontend operation documents with the server validator", documents)
}

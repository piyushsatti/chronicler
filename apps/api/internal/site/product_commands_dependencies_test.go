package site

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type dependencyTestRunner struct{}

func (*dependencyTestRunner) Do(context.Context, func(ProductCommandRepos) error) error { return nil }

func TestSiteCommandsRequireDependencies(t *testing.T) {
	var typedNilRunner *dependencyTestRunner
	var nilClock product.Clock
	var nilIDs product.IDGenerator
	cases := map[string]func() (*ProductCommands, error){
		"nil runner":       func() (*ProductCommands, error) { return NewProductCommands(nil, time.Now, uuid.NewString) },
		"typed nil runner": func() (*ProductCommands, error) { return NewProductCommands(typedNilRunner, time.Now, uuid.NewString) },
		"typed nil clock": func() (*ProductCommands, error) {
			return NewProductCommands(&dependencyTestRunner{}, nilClock, uuid.NewString)
		},
		"typed nil ids": func() (*ProductCommands, error) { return NewProductCommands(&dependencyTestRunner{}, time.Now, nilIDs) },
	}
	for name, build := range cases {
		if commands, err := build(); err == nil || commands != nil || err.Error() != "INTERNAL: site command dependencies required" {
			t.Fatalf("%s: commands=%v err=%v", name, commands, err)
		}
	}
	if _, err := NewProductCommands(&dependencyTestRunner{}, time.Now, uuid.NewString); err != nil {
		t.Fatal(err)
	}
}

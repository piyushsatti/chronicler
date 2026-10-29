package graph

import (
	"context"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

func TestCollectedActivitySelectionHandlesAliasesAndFragments(t *testing.T) {
	for _, test := range []struct {
		name, query, operation, root string
		path                         []string
		variables                    map[string]any
		want                         bool
	}{
		{"counts", `query { home { communityStats { totalMembers } } }`, "", "home", []string{"communityStats", "activity"}, nil, false},
		{"aliases", `query { front: home { stats: communityStats { events: activity { messages } } } }`, "", "home", []string{"communityStats", "activity"}, nil, true},
		{"fragments", `query { home { ...HomeFields } } fragment HomeFields on HomeType { communityStats { ... on SiteStatsType { ...ActivityFields } } } fragment ActivityFields on SiteStatsType { activity { voiceMinutes } }`, "", "home", []string{"communityStats", "activity"}, nil, true},
		{"merged selections", `query { home { communityStats { totalMembers } communityStats { activity { messages } } } }`, "", "home", []string{"communityStats", "activity"}, nil, true},
		{"site stats", `query { report: siteStats { ...Stats } } fragment Stats on SiteStatsType { events: activity { reactions } }`, "", "siteStats", []string{"activity"}, nil, true},
		{"selected operation", `query Counts { siteStats { totalMembers } } query Activity { siteStats { activity { messages } } }`, "Counts", "siteStats", []string{"activity"}, nil, false},
		{"skip", `query { siteStats { activity @skip(if:true) { messages } totalMembers } }`, "", "siteStats", []string{"activity"}, nil, false},
		{"conditional fragment", `query($events:Boolean!) { home { communityStats { ...Stats @include(if:$events) } } } fragment Stats on SiteStatsType { activity { messages } }`, "", "home", []string{"communityStats", "activity"}, map[string]any{"events": false}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			doc, err := parser.ParseQuery(&ast.Source{Input: test.query})
			if err != nil {
				t.Fatal(err)
			}
			operation := doc.Operations.ForName(test.operation)
			op := &graphql.OperationContext{Doc: doc, Operation: operation, Variables: test.variables}
			ctx := graphql.WithOperationContext(context.Background(), op)
			for _, field := range graphql.CollectFields(op, operation.SelectionSet, nil) {
				if field.Name != test.root {
					continue
				}
				ctx = graphql.WithFieldContext(ctx, &graphql.FieldContext{Field: field})
				if got := collectedSelection(ctx, test.path...); got != test.want {
					t.Fatalf("activity selected=%v, want %v", got, test.want)
				}
				return
			}
			t.Fatal("missing root field")
		})
	}
}

//go:build integration

package site_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	productgraphql "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
)

type activityQueryTrace struct {
	dbgen.DBTX
	mu      sync.Mutex
	queries []string
}

func (d *activityQueryTrace) record(query string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.queries = append(d.queries, query)
}

func (d *activityQueryTrace) Query(ctx context.Context, query string, args ...any) (pgx.Rows, error) {
	d.record(query)
	return d.DBTX.Query(ctx, query, args...)
}

func (d *activityQueryTrace) QueryRow(ctx context.Context, query string, args ...any) pgx.Row {
	d.record(query)
	return d.DBTX.QueryRow(ctx, query, args...)
}

func (d *activityQueryTrace) activityReads() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	count := 0
	for _, query := range d.queries {
		if strings.Contains(query, "discord_activity_events") {
			count++
		}
	}
	return count
}

type activityDiscovery struct{ document.DiscoveryReader }

func (activityDiscovery) RecentDiscovery(context.Context, auth.Authority) ([]document.DiscoveryBucket, error) {
	return []document.DiscoveryBucket{}, nil
}

func activitySelectionFixture(t *testing.T) (http.Handler, *activityQueryTrace) {
	t.Helper()
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount)
		VALUES('selection-voice','voice','selection-member','selection-channel',now(),12.5),
		      ('selection-message','message','selection-member','selection-channel',now(),7),
		      ('selection-reaction','reaction','selection-member','selection-channel',now(),2)`); err != nil {
		t.Fatal(err)
	}
	trace := &activityQueryTrace{DBTX: f.Pool}
	pg, err := site.NewProductPostgres(trace)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(trace)
	if err != nil {
		t.Fatal(err)
	}
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	queries, err := site.NewProductQueries(site.ProductReadRepos{Site: pg}, policy, time.Now, observer, activityDiscovery{})
	if err != nil {
		t.Fatal(err)
	}
	handler := productgraphql.NewHandler(&graph.Resolver{Services: graph.Services{SiteQueries: queries}}, productgraphql.DefaultLimits(), func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil })
	return handler, trace
}

func activitySelectionCall(t *testing.T, handler http.Handler, query string) map[string]json.RawMessage {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"query": query})
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var result struct {
		Data   map[string]json.RawMessage
		Errors []json.RawMessage
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusOK || len(result.Errors) != 0 {
		t.Fatalf("status=%d response=%s err=%v", response.Code, response.Body.String(), err)
	}
	return result.Data
}

func TestSiteCountsDoNotReadDiscordActivityUnlessSelected(t *testing.T) {
	handler, trace := activitySelectionFixture(t)
	activitySelectionCall(t, handler, `query { home { communityStats { totalMembers totalQuests } } siteStats { totalMembers totalRegions } }`)
	if got := trace.activityReads(); got != 0 {
		t.Fatalf("counts-only activity reads=%d, want zero", got)
	}
	activitySelectionCall(t, handler, `query { siteStats { activity { messages } } }`)
	if got := trace.activityReads(); got != 1 {
		t.Fatalf("selected activity reads=%d, want one", got)
	}
}

func TestSelectedSiteActivityRetainsStoredTotalsThroughFragments(t *testing.T) {
	handler, trace := activitySelectionFixture(t)
	data := activitySelectionCall(t, handler, `query { front:home { ...HomeFields } report:siteStats { ...Stats } }
		fragment HomeFields on HomeType { communityStats { ...Stats } }
		fragment Stats on SiteStatsType { events:activity { voiceMinutes messages reactions } }`)
	var front struct {
		CommunityStats struct {
			Events struct{ VoiceMinutes, Messages, Reactions float64 }
		}
	}
	var report struct {
		Events struct{ VoiceMinutes, Messages, Reactions float64 }
	}
	if err := json.Unmarshal(data["front"], &front); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data["report"], &report); err != nil {
		t.Fatal(err)
	}
	if front.CommunityStats.Events != report.Events || report.Events.VoiceMinutes != 12.5 || report.Events.Messages != 7 || report.Events.Reactions != 2 {
		t.Fatalf("front=%s report=%s, want stored activity totals", data["front"], data["report"])
	}
	if got := trace.activityReads(); got != 2 {
		t.Fatalf("selected activity reads=%d, want one for each selected root", got)
	}
}

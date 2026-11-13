package site

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func TestNewProductPostgresRejectsNilExecutors(t *testing.T) {
	if adapter, err := NewProductPostgres(nil); err == nil || adapter != nil {
		t.Fatalf("nil executor returned adapter=%v err=%v, want configuration error", adapter, err)
	}
	var pool *pgxpool.Pool
	if adapter, err := NewProductPostgres(pool); err == nil || adapter != nil {
		t.Fatalf("typed-nil executor returned adapter=%v err=%v, want configuration error", adapter, err)
	}
}

func TestMapDeliveryUsesCanonicalInternalQuestDestination(t *testing.T) {
	for _, test := range []struct {
		code string
		want string
	}{{"fixture-quest", "/quests/fixture-quest"}, {"quest/with space", "/quests/quest%2Fwith%20space"}} {
		job := mapAdminDeliveryJob(dbgen.SiteAdminDeliveryJobsRow{QuestShortCode: pgtype.Text{String: test.code, Valid: true}})
		if job.QuestLink == nil || *job.QuestLink != test.want {
			t.Fatalf("code=%q link=%v, want %q", test.code, job.QuestLink, test.want)
		}
	}
	missing := mapAdminDeliveryJob(dbgen.SiteAdminDeliveryJobsRow{})
	if missing.QuestLink != nil || missing.QuestTitle != nil || missing.QuestId != nil {
		t.Fatalf("missing association fabricated metadata: %+v", missing)
	}
}

func TestMapAdminDeliveryJobExplainsDiscordFailure(t *testing.T) {
	body := `{"message":"Unknown Channel","code":10003}`
	for _, test := range []struct {
		name    string
		code    string
		message string
		want    string
	}{
		{name: "stored permission", code: delivery.SafeCodeDiscordPermission, message: "discord api status 404: " + body, want: delivery.SafeCodeDiscordPermission},
		{name: "missing channel", message: "discord create message: discord api status 404: " + body, want: delivery.SafeCodeDiscordNotFound},
		{name: "rate limit", message: "discord api status 429: slow down", want: delivery.SafeCodeDiscordRateLimit},
		{name: "unavailable", message: "discord api status 502: bad gateway", want: delivery.SafeCodeDiscordUnavailable},
		{name: "login refused", message: "discord api status 401", want: delivery.SafeCodeDiscordUnauthorized},
		{name: "not configured", message: "discord delivery not configured: announce channel", want: delivery.SafeCodeDiscordNotConfigured},
		{name: "unreachable", message: "discord create message: dial tcp 1.2.3.4:443: i/o timeout", want: delivery.SafeCodeDiscordUnreachable},
		{name: "unknown", message: "pq: deadlock detected", want: delivery.SafeCodeDiscordRejected},
	} {
		t.Run(test.name, func(t *testing.T) {
			row := dbgen.SiteAdminDeliveryJobsRow{ErrorMessage: pgtype.Text{String: test.message, Valid: true}}
			if test.code != "" {
				row.SafeErrorCode = pgtype.Text{String: test.code, Valid: true}
			}
			job := mapAdminDeliveryJob(row)
			if job.SafeError == nil || *job.SafeError != test.want || strings.Contains(*job.SafeError, "Unknown Channel") || strings.Contains(*job.SafeError, body) {
				t.Fatalf("safe error=%v, want %s", job.SafeError, test.want)
			}
		})
	}
	if job := mapAdminDeliveryJob(dbgen.SiteAdminDeliveryJobsRow{}); job.SafeError != nil {
		t.Fatalf("empty failure invented %q", *job.SafeError)
	}
}

func TestMapCommunitySnapshotMapsStoredTotalsAndRoles(t *testing.T) {
	rows := []dbgen.SiteCommunitySnapshotRow{
		{TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalPointcrawlNodes: 9, TotalRegions: 4, TotalQuests: 5, TotalDms: 1,
			Role: "dm", MemberCount: pgtype.Int4{Int32: 2, Valid: true}},
		{TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalPointcrawlNodes: 9, TotalRegions: 4, TotalQuests: 5, TotalDms: 1,
			Role: "player", MemberCount: pgtype.Int4{Int32: 6, Valid: true}},
	}
	got, err := mapCommunitySnapshot(rows)
	if err != nil {
		t.Fatal(err)
	}
	want := CommunityStatsSnapshot{
		TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalRegions: 4, TotalQuests: 5, TotalDMs: 1,
		MembersByRole: []CountByKeyView{{Key: "dm", Count: 2}, {Key: "player", Count: 6}},
	}
	if got.TotalMembers != want.TotalMembers || got.ActiveCharacters != want.ActiveCharacters || got.TotalMaps != want.TotalMaps ||
		got.TotalRegions != want.TotalRegions || got.TotalQuests != want.TotalQuests ||
		got.TotalDMs != want.TotalDMs || got.Activity != want.Activity || len(got.MembersByRole) != len(want.MembersByRole) {
		t.Fatalf("snapshot = %+v, want %+v", got, want)
	}
	for i := range want.MembersByRole {
		if got.MembersByRole[i] != want.MembersByRole[i] {
			t.Fatalf("role counts = %+v, want %+v", got.MembersByRole, want.MembersByRole)
		}
	}
}

func TestMapCommunitySnapshotAcceptsEmptyRoleSetAndRejectsMissingTotals(t *testing.T) {
	got, err := mapCommunitySnapshot([]dbgen.SiteCommunitySnapshotRow{{TotalMembers: 0}})
	if err != nil {
		t.Fatal(err)
	}
	if got.MembersByRole == nil || len(got.MembersByRole) != 0 || got.TotalMembers != 0 {
		t.Fatalf("empty snapshot = %+v, want initialized empty roles and stored zero totals", got)
	}
	if _, err := mapCommunitySnapshot(nil); err == nil {
		t.Fatal("missing totals row returned success")
	}
}

func TestMapMemberDiscoveryUsesPublicIdentityAndPreservesNullableAvatar(t *testing.T) {
	publicID := uuid.New()
	rows := []dbgen.SiteMemberDiscoveryRow{{
		Total:       1,
		PublicID:    pgtype.UUID{Bytes: publicID, Valid: true},
		Handle:      pgtype.Text{String: "player", Valid: true},
		DisplayName: pgtype.Text{String: "Player One", Valid: true},
	}}
	got, err := mapMemberDiscovery(rows)
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 1 || got.Order != "handle_asc_id_asc" || len(got.Items) != 1 {
		t.Fatalf("page = %+v", got)
	}
	if got.Items[0].MemberId != publicID.String() || got.Items[0].Handle != "player" || got.Items[0].DisplayName != "Player One" || got.Items[0].AvatarUrl != nil {
		t.Fatalf("member = %+v, want public identity and nil avatar", got.Items[0])
	}
}

func TestMapMemberDiscoveryPreservesEmptyTotalPage(t *testing.T) {
	got, err := mapMemberDiscovery([]dbgen.SiteMemberDiscoveryRow{{Total: 7}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 7 || got.Items == nil || len(got.Items) != 0 || got.Order != memberSearchOrder {
		t.Fatalf("page = %+v, want total 7 with an initialized empty page", got)
	}
	if _, err := mapMemberDiscovery(nil); err == nil {
		t.Fatal("missing total row returned success")
	}
}

func TestMapSearchKindsPreservesStaticCatalog(t *testing.T) {
	want := SearchableKinds()
	got := mapSearchKinds(want)
	if len(got) != len(want) {
		t.Fatalf("kinds len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i].Key != want[i].Key || got[i].Label != want[i].Label || got[i].Searchable != want[i].Searchable {
			t.Fatalf("kind[%d] = %+v, want %+v", i, got[i], want[i])
		}
		if want[i].ExclusionReason == nil {
			if got[i].ExclusionReason != nil {
				t.Fatalf("kind[%d] exclusion = %v, want nil", i, got[i].ExclusionReason)
			}
			continue
		}
		if got[i].ExclusionReason == nil || *got[i].ExclusionReason != *want[i].ExclusionReason {
			t.Fatalf("kind[%d] exclusion = %v, want %v", i, got[i].ExclusionReason, want[i].ExclusionReason)
		}
	}
}

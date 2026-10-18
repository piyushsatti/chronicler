package site

import (
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
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

func TestMapCommunitySnapshotMapsStoredTotalsRolesAndActivity(t *testing.T) {
	rows := []dbgen.SiteCommunitySnapshotRow{
		{TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalPointcrawlNodes: 9, TotalRegions: 4, TotalQuests: 5, TotalDms: 1,
			VoiceMinutes: 12.5, Messages: 7, Reactions: 2, Role: "dm", MemberCount: pgtype.Int4{Int32: 2, Valid: true}},
		{TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalPointcrawlNodes: 9, TotalRegions: 4, TotalQuests: 5, TotalDms: 1,
			VoiceMinutes: 12.5, Messages: 7, Reactions: 2, Role: "player", MemberCount: pgtype.Int4{Int32: 6, Valid: true}},
	}
	got, err := mapCommunitySnapshot(rows)
	if err != nil {
		t.Fatal(err)
	}
	want := CommunityStatsSnapshot{
		TotalMembers: 8, ActiveCharacters: 3, TotalMaps: 2, TotalRegions: 4, TotalQuests: 5, TotalDMs: 1,
		MembersByRole: []CountByKeyView{{Key: "dm", Count: 2}, {Key: "player", Count: 6}},
		Activity:      member.ActivitySummaryView{VoiceMinutes: 12.5, Messages: 7, Reactions: 2},
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

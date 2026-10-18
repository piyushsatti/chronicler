package member_test

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
)

var _ member.GrantReconciler = member.NewGrantReconciler()

func TestPhase3TaskM08Acceptance(t *testing.T) {
	const (
		achievementA = "00000000-0000-4000-8000-000000000001"
		achievementB = "00000000-0000-4000-8000-000000000002"
		achievementC = "00000000-0000-4000-8000-000000000003"
		tierA        = "00000000-0000-4000-8000-000000000004"
		tierB        = "00000000-0000-4000-8000-000000000005"
		tierC        = "00000000-0000-4000-8000-000000000006"
	)
	older := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	newer := older.Add(time.Hour)
	grant := func(id string, at time.Time) member.MemberUnlockView {
		return member.MemberUnlockView{
			MemberId:     "00000000-0000-4000-8000-000000000007",
			UnlockableId: id,
			Source:       "grant",
			UnlockedAt:   at,
		}
	}
	empty := member.GrantedUnlockProjection{AchievementNames: []string{}}
	tests := []struct {
		name    string
		catalog []member.UnlockableView
		grants  []member.MemberUnlockView
		want    member.GrantedUnlockProjection
		wantErr bool
	}{
		{name: "empty inputs", want: empty},
		{
			name: "ungranted catalog entries never become achievements or tiers",
			catalog: []member.UnlockableView{
				{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "Available achievement", Active: true},
				{Id: tierA, Kind: member.UnlockKindDmTier, Name: "Available tier", Active: true},
			},
			want: empty,
		},
		{
			name: "retired earned achievement uses current catalog name",
			catalog: []member.UnlockableView{
				{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "Renamed achievement", Active: false},
				{Id: achievementB, Kind: member.UnlockKindAchievement, Name: "Ungrantable by a read", Active: true},
			},
			grants: []member.MemberUnlockView{grant(achievementA, older)},
			want:   member.GrantedUnlockProjection{AchievementNames: []string{"Renamed achievement"}},
		},
		{
			name: "achievements sort by descending time then descending unlock UUID",
			catalog: []member.UnlockableView{
				{Id: achievementC, Kind: member.UnlockKindAchievement, Name: "Old highest UUID"},
				{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "New lower UUID"},
				{Id: achievementB, Kind: member.UnlockKindAchievement, Name: "New higher UUID"},
			},
			grants: []member.MemberUnlockView{
				grant(achievementA, newer),
				grant(achievementC, older),
				grant(achievementB, newer.In(time.FixedZone("UTC+2", 2*60*60))),
			},
			want: member.GrantedUnlockProjection{AchievementNames: []string{"New higher UUID", "New lower UUID", "Old highest UUID"}},
		},
		{
			name: "latest explicit tier wins even when retired and higher UUID tier is older",
			catalog: []member.UnlockableView{
				{Id: tierC, Kind: member.UnlockKindDmTier, Name: "Older tier", Active: true},
				{Id: tierA, Kind: member.UnlockKindDmTier, Name: "Current renamed tier", Active: false},
				{Id: tierB, Kind: member.UnlockKindDmTier, Name: "Ungrantable by a read", Active: true},
				{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "Latest achievement"},
			},
			grants: []member.MemberUnlockView{grant(tierC, older), grant(tierA, newer), grant(achievementA, newer.Add(time.Hour))},
			want:   member.GrantedUnlockProjection{AchievementNames: []string{"Latest achievement"}, DMTier: "Current renamed tier"},
		},
		{
			name: "tier time ties use descending unlock UUID",
			catalog: []member.UnlockableView{
				{Id: tierA, Kind: member.UnlockKindDmTier, Name: "Lower UUID tier"},
				{Id: tierB, Kind: member.UnlockKindDmTier, Name: "Higher UUID tier"},
			},
			grants: []member.MemberUnlockView{grant(tierA, newer), grant(tierB, newer)},
			want:   member.GrantedUnlockProjection{AchievementNames: []string{}, DMTier: "Higher UUID tier"},
		},
		{
			name:    "grants without a catalog fail as a dependency",
			grants:  []member.MemberUnlockView{grant(achievementA, newer)},
			wantErr: true,
		},
		{
			name: "missing linkage fails without returning a partial projection",
			catalog: []member.UnlockableView{
				{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "Linked achievement"},
			},
			grants:  []member.MemberUnlockView{grant(achievementA, newer), grant(tierA, older)},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := member.NewGrantReconciler().Project(tt.catalog, tt.grants)
			if tt.wantErr {
				if err == nil {
					t.Fatal("missing catalog dependency returned success")
				}
				if !reflect.DeepEqual(got, member.GrantedUnlockProjection{}) {
					t.Fatalf("dependency failure returned a partial projection: %#v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("projection = %#v, want %#v", got, tt.want)
			}
		})
	}

	t.Run("inputs remain unchanged and each call reads the current catalog and grants", func(t *testing.T) {
		rule := json.RawMessage(`{"type":"admin_grant"}`)
		catalog := []member.UnlockableView{
			{Id: achievementA, Kind: member.UnlockKindAchievement, Name: "Original name", Active: false, Payload: json.RawMessage(`{"label":"kept"}`), UnlockRule: &rule},
			{Id: tierA, Kind: member.UnlockKindDmTier, Name: "Explicit tier", Active: true},
		}
		grants := []member.MemberUnlockView{grant(achievementA, older), grant(tierA, newer)}
		inputs := struct {
			Catalog []member.UnlockableView
			Grants  []member.MemberUnlockView
		}{catalog, grants}
		before, err := json.Marshal(inputs)
		if err != nil {
			t.Fatal(err)
		}
		reconciler := member.NewGrantReconciler()
		first, err := reconciler.Project(catalog, grants)
		if err != nil {
			t.Fatal(err)
		}
		after, err := json.Marshal(inputs)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(before, after) {
			t.Fatal("projection mutated catalog or grant inputs")
		}
		first.AchievementNames[0] = "Caller changed result"
		catalog[0].Name = "Current name"
		second, err := reconciler.Project(catalog, grants[:1])
		if err != nil {
			t.Fatal(err)
		}
		want := member.GrantedUnlockProjection{AchievementNames: []string{"Current name"}}
		if !reflect.DeepEqual(second, want) {
			t.Fatalf("fresh projection = %#v, want %#v", second, want)
		}
		third, err := reconciler.Project(nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(third, empty) {
			t.Fatalf("empty projection after granted projection = %#v, want %#v", third, empty)
		}
	})
}

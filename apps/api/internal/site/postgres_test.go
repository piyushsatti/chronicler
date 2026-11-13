package site

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type stubSiteStatsQueries struct {
	members     int32
	memberErr   error
	rows        []dbgen.SiteCommunitySnapshotRow
	snapshotErr error
}

func (s stubSiteStatsQueries) CountMembersSite(context.Context) (int32, error) {
	return s.members, s.memberErr
}

func (s stubSiteStatsQueries) SiteCommunitySnapshot(context.Context) ([]dbgen.SiteCommunitySnapshotRow, error) {
	return s.rows, s.snapshotErr
}

func TestPostgresStatsUsesActiveMembersAndSnapshotCounts(t *testing.T) {
	dbErr := errors.New("database unavailable")
	for _, tt := range []struct {
		name    string
		q       stubSiteStatsQueries
		want    Stats
		wantErr error
	}{
		{
			name: "snapshot counts",
			q: stubSiteStatsQueries{
				members: 2,
				rows: []dbgen.SiteCommunitySnapshotRow{{
					TotalMembers: 9, ActiveCharacters: 3, TotalQuests: 7,
				}},
			},
			want: Stats{TotalMembers: 2, ActiveCharacters: 3, TotalQuests: 7},
		},
		{
			name: "empty",
			q:    stubSiteStatsQueries{rows: []dbgen.SiteCommunitySnapshotRow{{}}},
		},
		{
			name:    "member count failure",
			q:       stubSiteStatsQueries{memberErr: dbErr},
			wantErr: dbErr,
		},
		{
			name:    "snapshot failure",
			q:       stubSiteStatsQueries{members: 2, snapshotErr: dbErr},
			wantErr: dbErr,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := (&PostgresStats{q: tt.q}).Stats(context.Background())
			if !errors.Is(err, tt.wantErr) || got != tt.want {
				t.Fatalf("stats=%+v err=%v, want %+v err=%v", got, err, tt.want, tt.wantErr)
			}
		})
	}
}

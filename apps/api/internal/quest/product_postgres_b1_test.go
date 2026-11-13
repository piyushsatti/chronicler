package quest

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func TestGroupQuestBatchParticipantsKeepsLastPlayedAt(t *testing.T) {
	played := time.Date(2024, 3, 4, 5, 6, 7, 0, time.UTC)
	row := func(at pgtype.Timestamptz) dbgen.ProductQuestBatchParticipantsRow {
		return dbgen.ProductQuestBatchParticipantsRow{
			InputIndex:        1,
			QuestPublicID:     db.MustUUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
			MemberPublicID:    db.MustUUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
			CharacterPublicID: db.MustUUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
			CharacterName:     pgtype.Text{String: "Rook", Valid: true},
			Status:            pgtype.Text{String: "waitlisted", Valid: true},
			CreatedAt:         pgtype.Timestamptz{Time: played, Valid: true},
			UpdatedAt:         pgtype.Timestamptz{Time: played, Valid: true},
			LastPlayedAt:      at,
		}
	}
	got := groupQuestBatchParticipants([]dbgen.ProductQuestBatchParticipantsRow{
		row(pgtype.Timestamptz{Time: played, Valid: true}),
	}, []int{0})
	if got[0][0].LastPlayedAt == nil || !got[0][0].LastPlayedAt.Equal(played) {
		t.Fatalf("last played = %v", got[0][0].LastPlayedAt)
	}
	none := groupQuestBatchParticipants([]dbgen.ProductQuestBatchParticipantsRow{row(pgtype.Timestamptz{})}, []int{0})
	if none[0][0].LastPlayedAt != nil {
		t.Fatalf("missing last played = %v", none[0][0].LastPlayedAt)
	}
}

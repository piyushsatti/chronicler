package member

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type profileScriptRow struct {
	err  error
	scan func(dest ...any) error
}

type profileScriptDB struct {
	t        *testing.T
	queryRow map[string]profileScriptRow
	query    map[string][]profileScriptRow
}

func (d *profileScriptDB) Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error) {
	d.t.Fatal("unexpected Exec")
	return pgconn.CommandTag{}, nil
}

func (d *profileScriptDB) Query(_ context.Context, sql string, _ ...interface{}) (pgx.Rows, error) {
	key := profileSQLKey(sql)
	rows, ok := d.query[key]
	if !ok {
		d.t.Fatalf("unexpected Query %q", key)
	}
	return &profileScriptRows{rows: rows}, nil
}

func (d *profileScriptDB) QueryRow(_ context.Context, sql string, _ ...interface{}) pgx.Row {
	key := profileSQLKey(sql)
	row, ok := d.queryRow[key]
	if !ok {
		d.t.Fatalf("unexpected QueryRow %q", key)
	}
	return profileScriptRowResult{row: row}
}

type profileScriptRowResult struct {
	row profileScriptRow
}

func (r profileScriptRowResult) Scan(dest ...any) error {
	if r.row.err != nil {
		return r.row.err
	}
	return r.row.scan(dest...)
}

type profileScriptRows struct {
	rows []profileScriptRow
	i    int
	err  error
}

func (r *profileScriptRows) Close()                                       {}
func (r *profileScriptRows) Err() error                                   { return r.err }
func (r *profileScriptRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *profileScriptRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *profileScriptRows) Next() bool {
	if r.i >= len(r.rows) {
		return false
	}
	r.i++
	return true
}
func (r *profileScriptRows) Scan(dest ...any) error {
	row := r.rows[r.i-1]
	if row.err != nil {
		return row.err
	}
	return row.scan(dest...)
}
func (r *profileScriptRows) Values() ([]any, error)     { return nil, nil }
func (r *profileScriptRows) RawValues() [][]byte        { return nil }
func (r *profileScriptRows) Conn() *pgx.Conn            { return nil }

func profileSQLKey(sql string) string {
	switch {
	case strings.Contains(sql, "ProductMemberIdentity"):
		return "identity"
	case strings.Contains(sql, "ProductMemberProfile"):
		return "profile"
	case strings.Contains(sql, "ProductMemberAvailability"):
		return "availability"
	case strings.Contains(sql, "ProductMemberActivity"):
		return "activity"
	default:
		return sql
	}
}

func assignDest(dest any, value any) {
	switch target := dest.(type) {
	case *pgtype.UUID:
		*target = value.(pgtype.UUID)
	case *string:
		*target = value.(string)
	case *pgtype.Text:
		*target = value.(pgtype.Text)
	case *[]string:
		*target = append([]string(nil), value.([]string)...)
	case *pgtype.Timestamptz:
		*target = value.(pgtype.Timestamptz)
	case *int64:
		*target = value.(int64)
	case *[]byte:
		if value == nil {
			*target = nil
			return
		}
		*target = append([]byte(nil), value.([]byte)...)
	case *bool:
		*target = value.(bool)
	case *int32:
		*target = value.(int32)
	case *int16:
		*target = value.(int16)
	case *float64:
		*target = value.(float64)
	case *any:
		*target = value
	default:
		panic("unsupported scan destination")
	}
}

func TestReadMemberProfileMissingHandleReturnsNil(t *testing.T) {
	adapter, err := NewProductPostgres(&profileScriptDB{
		t: t,
		queryRow: map[string]profileScriptRow{
			"identity": {err: pgx.ErrNoRows},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	view, err := adapter.ReadMemberProfile(context.Background(), auth.Authority{}, MemberProfileSpec{Handle: "missing"})
	if err != nil || view != nil {
		t.Fatalf("missing profile = %+v err=%v", view, err)
	}
}

func TestReadMemberProfileComposesIdentityDmAvailabilityAndActivity(t *testing.T) {
	const memberID = "10000000-0000-4000-8000-000000000042"
	id := db.MustUUID(memberID)
	joined := pgtype.Timestamptz{Time: time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC), Valid: true}
	note := "evening table"
	adapter, err := NewProductPostgres(&profileScriptDB{
		t: t,
		queryRow: map[string]profileScriptRow{
			"identity": {scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], "discord-42")
				assignDest(dest[2], "wayfinder")
				assignDest(dest[3], "Wayfinder")
				assignDest(dest[4], pgtype.Text{String: "https://avatar.example/42", Valid: true})
				assignDest(dest[5], []string{"player", "dm"})
				assignDest(dest[6], "active")
				assignDest(dest[7], joined)
				assignDest(dest[8], joined)
				return nil
			}},
			"profile": {scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], int64(7))
				assignDest(dest[2], pgtype.Text{String: "open table", Valid: true})
				assignDest(dest[3], pgtype.Text{String: "fiction first", Valid: true})
				assignDest(dest[4], pgtype.Text{})
				assignDest(dest[5], []byte(`{"seats":4}`))
				assignDest(dest[6], true)
				assignDest(dest[7], "approved")
				assignDest(dest[8], int32(3))
				assignDest(dest[9], joined)
				return nil
			}},
			"activity": {scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], 12.0)
				assignDest(dest[2], 4.0)
				assignDest(dest[3], 90.0)
				assignDest(dest[4], any(nil))
				assignDest(dest[5], 1.5)
				assignDest(dest[6], int64(2))
				assignDest(dest[7], int64(1))
				return nil
			}},
		},
		query: map[string][]profileScriptRow{
			"availability": {{scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], int16(2))
				assignDest(dest[2], int16(18*60))
				assignDest(dest[3], int16(21*60))
				assignDest(dest[4], pgtype.Text{String: note, Valid: true})
				return nil
			}}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	view, err := adapter.ReadMemberProfile(context.Background(), auth.Authority{}, MemberProfileSpec{Handle: "wayfinder"})
	if err != nil || view == nil {
		t.Fatalf("profile = %+v err=%v", view, err)
	}
	if view.Member.Id != memberID || view.Member.Handle != "wayfinder" || view.Member.DisplayName != "Wayfinder" {
		t.Fatalf("member identity = %+v", view.Member)
	}
	if view.Member.DiscordId == nil || *view.Member.DiscordId != "discord-42" {
		t.Fatalf("discord id = %v", view.Member.DiscordId)
	}
	if view.DmProfile == nil || view.DmProfile.Status != "approved" || view.DmProfile.Tagline == nil || *view.DmProfile.Tagline != "open table" {
		t.Fatalf("dm profile = %+v", view.DmProfile)
	}
	if len(view.Availability) != 1 || view.Availability[0].Day != "TUESDAY" ||
		view.Availability[0].StartTime != product.Time("18:00:00") || view.Availability[0].EndTime != product.Time("21:00:00") ||
		view.Availability[0].Note == nil || *view.Availability[0].Note != note {
		t.Fatalf("availability = %+v", view.Availability)
	}
	if view.ActivitySummary != (ActivitySummaryView{Messages: 12, Reactions: 4, VoiceMinutes: 90}) {
		t.Fatalf("activity = %+v", view.ActivitySummary)
	}
}

func TestReadMemberProfileOmitsMissingDmProfile(t *testing.T) {
	const memberID = "10000000-0000-4000-8000-000000000043"
	id := db.MustUUID(memberID)
	joined := pgtype.Timestamptz{Time: time.Date(2024, 5, 6, 7, 8, 9, 0, time.UTC), Valid: true}
	adapter, err := NewProductPostgres(&profileScriptDB{
		t: t,
		queryRow: map[string]profileScriptRow{
			"identity": {scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], "discord-43")
				assignDest(dest[2], "scribe")
				assignDest(dest[3], "Scribe")
				assignDest(dest[4], pgtype.Text{})
				assignDest(dest[5], []string{"player"})
				assignDest(dest[6], "active")
				assignDest(dest[7], joined)
				assignDest(dest[8], joined)
				return nil
			}},
			"profile": {err: pgx.ErrNoRows},
			"activity": {scan: func(dest ...any) error {
				assignDest(dest[0], id)
				assignDest(dest[1], 0.0)
				assignDest(dest[2], 0.0)
				assignDest(dest[3], 0.0)
				assignDest(dest[4], any(nil))
				assignDest(dest[5], 0.0)
				assignDest(dest[6], int64(0))
				assignDest(dest[7], int64(0))
				return nil
			}},
		},
		query: map[string][]profileScriptRow{
			"availability": {},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	view, err := adapter.ReadMemberProfile(context.Background(), auth.Authority{}, MemberProfileSpec{Handle: "scribe"})
	if err != nil || view == nil {
		t.Fatalf("profile = %+v err=%v", view, err)
	}
	if view.DmProfile != nil {
		t.Fatalf("expected nil dm profile, got %+v", view.DmProfile)
	}
	if view.Availability == nil || len(view.Availability) != 0 {
		t.Fatalf("availability = %+v", view.Availability)
	}
	if view.ActivitySummary != (ActivitySummaryView{}) {
		t.Fatalf("activity = %+v", view.ActivitySummary)
	}
}

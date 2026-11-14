package document

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type notificationAudienceDB struct {
	dbgen.DBTX
	err error
}

func (f notificationAudienceDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, f.err
}

func (f notificationAudienceDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return notificationAudienceRow{err: f.err}
}

type notificationAudienceRow struct{ err error }

func (r notificationAudienceRow) Scan(...any) error { return r.err }

func TestNotificationAudienceDistinguishesMissingDocumentFromDatabaseFailure(t *testing.T) {
	failure := errors.New("audience database failed")
	id := "10000000-0000-4000-8000-000000000010"
	for _, problem := range []error{pgx.ErrNoRows, failure} {
		reader, _ := NewProductPostgres(notificationAudienceDB{err: problem})
		readable, err := reader.ReadableDocumentIDs(context.Background(), auth.Authority{}, []string{id})
		if errors.Is(problem, pgx.ErrNoRows) {
			if err != nil || readable[id] {
				t.Fatalf("missing document=%v error=%v", readable, err)
			}
		} else if !errors.Is(err, failure) || readable != nil {
			t.Fatalf("dependency failure became unreadable success: %v, %v", readable, err)
		}
	}
}

package character

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func (p *ProductPostgres) ReadImmutableOwner(ctx context.Context, characterID string) (string, error) {
	id, err := characterProductID(characterID)
	if err != nil {
		return "", err
	}
	owner, err := p.queries().CharacterProductImmutableOwner(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apierr.New(apierr.NotFound, "character not found")
	}
	if err != nil {
		return "", err
	}
	return db.UUIDString(owner), nil
}

func (p *ProductPostgres) CharacterOwner(ctx context.Context, characterID string) (string, error) {
	return p.ReadImmutableOwner(ctx, characterID)
}

func (p *ProductPostgres) LockAdmissions(ctx context.Context, characterIDs []string) ([]Admission, error) {
	ids := make([]pgtype.UUID, 0, len(characterIDs))
	for _, value := range characterIDs {
		id, err := characterProductID(value)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	rows, err := p.queries().CharacterProductLockAdmissions(ctx, ids)
	if err != nil {
		return nil, err
	}
	admissions := make([]Admission, 0, len(rows))
	for _, row := range rows {
		admissions = append(admissions, Admission{ID: db.UUIDString(row.PublicID), OwnerID: db.UUIDString(row.OwnerID), Status: row.Status, OwnerStatus: row.OwnerStatus, Trusted: row.Status == "active", UpdatedAt: row.UpdatedAt.Time})
	}
	return admissions, nil
}

func (p *ProductPostgres) LockAdmission(ctx context.Context, characterID string) (Admission, error) {
	rows, err := p.LockAdmissions(ctx, []string{characterID})
	if err != nil {
		return Admission{}, err
	}
	if len(rows) != 1 {
		return Admission{}, apierr.New(apierr.NotFound, "character not found")
	}
	return rows[0], nil
}

var _ AdmissionReader = (*ProductPostgres)(nil)

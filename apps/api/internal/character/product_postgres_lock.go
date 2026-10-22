package character

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func (p *ProductPostgres) characterViewByID(ctx context.Context, characterID pgtype.UUID) (*CharacterView, error) {
	row, err := p.queries().CharacterProductByID(ctx, characterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view, err := mapProductCharacter(row.ID, row.ShortCode, row.Name, row.OwnerID, row.BackstoryID, row.GuildID, row.RegionID, row.Status, row.Description, row.BackgroundText, row.DdbUrl, row.ImageUrl, row.Pcxp, row.CreatedAt, row.UpdatedAt, row.VerificationSubmittedAt, row.VerificationStatus, row.DdbPayload, row.DdbSyncedAt)
	if err != nil {
		return nil, err
	}
	return &view, nil
}

func (p *ProductPostgres) lockCharacterRow(ctx context.Context, characterID string) (dbgen.CharacterProductLockByIDRow, *CharacterView, error) {
	uid, err := characterProductID(characterID)
	if err != nil {
		return dbgen.CharacterProductLockByIDRow{}, nil, err
	}
	row, err := p.queries().CharacterProductLockByID(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return dbgen.CharacterProductLockByIDRow{}, nil, nil
	}
	if err != nil {
		return dbgen.CharacterProductLockByIDRow{}, nil, err
	}
	view, err := p.characterViewByID(ctx, uid)
	if err != nil {
		return dbgen.CharacterProductLockByIDRow{}, nil, err
	}
	return row, view, nil
}

func characterLockState(subjectID string, row dbgen.CharacterProductLockByIDRow, before *CharacterView) (exists bool, ownerID string, updatedAt *time.Time) {
	if !row.PublicID.Valid || before == nil {
		return false, "", nil
	}
	updated := row.UpdatedAt.Time
	return !row.DeletedAt.Valid, before.OwnerId, &updated
}

func (p *ProductPostgres) baseCharacterLockState(ctx context.Context, characterID string) (exists bool, subjectID, ownerID string, updatedAt *time.Time, before *CharacterView, err error) {
	row, view, err := p.lockCharacterRow(ctx, characterID)
	if err != nil {
		return false, "", "", nil, nil, err
	}
	exists, ownerID, updatedAt = characterLockState(characterID, row, view)
	if !row.PublicID.Valid {
		return false, characterID, "", nil, nil, nil
	}
	return exists, db.UUIDString(row.PublicID), ownerID, updatedAt, view, nil
}

func (p *ProductPostgres) reloadCharacter(ctx context.Context, characterID string) (CharacterView, error) {
	uid, err := characterProductID(characterID)
	if err != nil {
		return CharacterView{}, err
	}
	view, err := p.characterViewByID(ctx, uid)
	if err != nil {
		return CharacterView{}, err
	}
	if view == nil {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	return *view, nil
}

func pgTime(at time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: at.UTC(), Valid: true}
}

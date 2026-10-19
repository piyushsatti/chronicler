package member

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// ReadMemberProfile loads a public member profile by handle.
// Missing members return (nil, nil). DmProfile is omitted when no row exists.
func (p *ProductPostgres) ReadMemberProfile(ctx context.Context, _ auth.Authority, spec MemberProfileSpec) (*MemberProfileView, error) {
	identity, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{
		Handle: pgtype.Text{String: spec.Handle, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	member := mapProductMember(
		identity.PublicID,
		identity.DiscordID,
		identity.Handle,
		identity.DisplayName,
		identity.AvatarUrl,
		identity.Roles,
		identity.Status,
		identity.JoinedAt,
	)
	view := &MemberProfileView{
		Member:       member,
		Availability: []AvailabilitySlotView{},
	}

	profileRow, err := p.queries().ProductMemberProfile(ctx, identity.PublicID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		profile := mapDmProfileRow(
			member.Id,
			profileRow.Tagline,
			profileRow.Philosophy,
			profileRow.HouseRules,
			profileRow.TableInfo,
			profileRow.AcceptingPlayers,
			profileRow.Status,
			profileRow.ReviewRevision,
		)
		view.DmProfile = &profile
	}

	slots, err := p.availability(ctx, identity.PublicID)
	if err != nil {
		return nil, err
	}
	view.Availability = slots

	activity, err := p.queries().ProductMemberActivity(ctx, identity.PublicID)
	if errors.Is(err, pgx.ErrNoRows) {
		return view, nil
	}
	if err != nil {
		return nil, err
	}
	view.ActivitySummary = ActivitySummaryView{
		Messages:     activity.Messages,
		Reactions:    activity.Reactions,
		VoiceMinutes: activity.VoiceMinutes,
	}
	return view, nil
}

var (
	_ MemberReadRepository  = (*ProductPostgres)(nil)
	_ MemberWriteRepository = (*ProductPostgres)(nil)
)

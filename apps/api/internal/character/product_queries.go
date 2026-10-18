package character

import (
	"context"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dependency := range []any{reads.Character, reads.Reference, reads.Batch, reads.DocumentAudience, policy, clock, overrideReads} {
		if dependency == nil {
			return nil, apierr.New(apierr.Internal, "character query dependencies required")
		}
		value := reflect.ValueOf(dependency)
		switch value.Kind() {
		case reflect.Pointer, reflect.Func, reflect.Interface, reflect.Map, reflect.Slice, reflect.Chan:
			if value.IsNil() {
				return nil, apierr.New(apierr.Internal, "character query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func characterQueryPage(limit, offset int32) error {
	if limit <= 0 || offset < 0 {
		return apierr.New(apierr.Invalid, "invalid character page")
	}
	return nil
}
func characterQueryID(value string) error {
	_, err := characterProductID(value)
	return err
}
func characterQueryText(value string, max int) error {
	if !utf8.ValidString(value) || strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > max {
		return apierr.New(apierr.Invalid, "invalid character query text")
	}
	return nil
}
func (s ProductQueries) authorizeRead(ctx context.Context, actor auth.Authority, request auth.Request, subject string) (func(), error) {
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return nil, err
	}
	if !decision.Allowed {
		return nil, apierr.New(apierr.Forbidden, "character read forbidden")
	}
	if !decision.UsedOverride {
		return func() {}, nil
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return nil, err
	}
	fact := auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "character", SubjectID: subject, RuleCode: decision.RuleCode, At: at}
	return func() { s.OverrideReads.Observe(ctx, fact) }, nil
}
func (s ProductQueries) publicRead(ctx context.Context, actor auth.Authority, op auth.Operation, subject string) (func(), error) {
	request, err := auth.ForOperation(op)
	if err != nil {
		return nil, err
	}
	return s.authorizeRead(ctx, actor, request, subject)
}
func (s ProductQueries) parentRead(ctx context.Context, actor auth.Authority, id string) (*CharacterView, error) {
	value, err := s.Reads.Character.ReadCharacter(ctx, actor, CharacterSpec{Id: &id})
	if err != nil {
		return nil, err
	}
	if value == nil {
		return nil, apierr.New(apierr.NotFound, "character not found")
	}
	return value, nil
}
func (s ProductQueries) projectCharacters(ctx context.Context, actor auth.Authority, items []CharacterView) ([]CharacterView, error) {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item.GuildId != nil {
			ids = append(ids, *item.GuildId)
		}
	}
	var visible map[string]bool
	if len(ids) > 0 {
		var err error
		visible, err = s.Reads.DocumentAudience.ReadableDocumentIDs(ctx, actor, ids)
		if err != nil {
			return nil, err
		}
	}
	now, err := product.UTCNow(s.Clock)
	if err != nil {
		return nil, err
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Unix() / 86400
	out := make([]CharacterView, len(items))
	copy(out, items)
	for i := range out {
		created := out[i].CreatedAt.UTC()
		createdDay := time.Date(created.Year(), created.Month(), created.Day(), 0, 0, 0, 0, time.UTC).Unix() / 86400
		days := today - createdDay
		if days < 0 {
			days = 0
		}
		if days > 2147483647 {
			return nil, apierr.New(apierr.Internal, "character age exceeds supported range")
		}
		out[i].DaysActive = int32(days)
		if out[i].GuildId != nil && !visible[*out[i].GuildId] {
			out[i].GuildId = nil
		}
		// Successful attempt history for nonowners remains owner-held.
		if out[i].OwnerId != actor.Claims().MemberID {
			out[i].DdbLastAttempt = nil
		}
	}
	return out, nil
}

func (s ProductQueries) AdminCharacterDirectory(ctx context.Context, actor auth.Authority, spec AdminCharacterDirectorySpec) (AdminCharacterDirectoryView, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	if spec.Filters != nil {
		if spec.Filters.RegionId != nil {
			if err := characterQueryID(*spec.Filters.RegionId); err != nil {
				return AdminCharacterDirectoryView{}, err
			}
		}
		if spec.Filters.NamePrefix != nil {
			if err := characterQueryText(*spec.Filters.NamePrefix, 200); err != nil {
				return AdminCharacterDirectoryView{}, err
			}
		}
		if spec.Filters.Status != nil {
			switch *spec.Filters.Status {
			case "active", "retired", "dead", "pending_approval":
			default:
				return AdminCharacterDirectoryView{}, apierr.New(apierr.Invalid, "invalid character status")
			}
		}
	}
	observe, err := s.publicRead(ctx, actor, "Query.adminCharacterDirectory", "")
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	value, err := s.Reads.Character.ReadAdminCharacterDirectory(ctx, actor, spec)
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Backstories(ctx context.Context, actor auth.Authority, spec BackstoriesSpec) (BackstoryPage, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return BackstoryPage{}, err
	}
	if spec.Filters != nil && spec.Filters.RegionId != nil {
		if err := characterQueryID(*spec.Filters.RegionId); err != nil {
			return BackstoryPage{}, err
		}
	}
	request := auth.ForBackstories(spec.Filters != nil && spec.Filters.IncludeRetired)
	observe, err := s.authorizeRead(ctx, actor, request, "")
	if err != nil {
		return BackstoryPage{}, err
	}
	value, err := s.Reads.Reference.ReadBackstories(ctx, actor, spec)
	if err != nil {
		return BackstoryPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Character(ctx context.Context, actor auth.Authority, spec CharacterSpec) (*CharacterView, error) {
	if (spec.Id == nil) == (spec.ShortCode == nil) {
		return nil, apierr.New(apierr.Invalid, "exactly one character identity required")
	}
	if spec.Id != nil {
		if err := characterQueryID(*spec.Id); err != nil {
			return nil, err
		}
	}
	if spec.ShortCode != nil {
		if err := characterQueryText(*spec.ShortCode, 64); err != nil {
			return nil, err
		}
	}
	observe, err := s.publicRead(ctx, actor, "Query.character", "")
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Character.ReadCharacter(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	if value != nil {
		items, err := s.projectCharacters(ctx, actor, []CharacterView{*value})
		if err != nil {
			return nil, err
		}
		value = &items[0]
	}
	observe()
	return value, nil
}

func (s ProductQueries) CharacterLogs(ctx context.Context, actor auth.Authority, spec CharacterLogsSpec) (CharacterLogListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return CharacterLogListResult{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return CharacterLogListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.characterLogs", spec.CharacterId)
	if err != nil {
		return CharacterLogListResult{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return CharacterLogListResult{}, err
	}
	value, err := s.Reads.Character.ReadCharacterLogs(ctx, actor, spec)
	if err != nil {
		return CharacterLogListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CharacterProgression(ctx context.Context, actor auth.Authority, spec CharacterProgressionSpec) (ProgressionListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return ProgressionListResult{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return ProgressionListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.characterProgression", spec.CharacterId)
	if err != nil {
		return ProgressionListResult{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return ProgressionListResult{}, err
	}
	value, err := s.Reads.Character.ReadCharacterProgression(ctx, actor, spec)
	if err != nil {
		return ProgressionListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CharacterSummaries(ctx context.Context, actor auth.Authority, spec CharacterSummariesSpec) (document.DocumentListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return document.DocumentListResult{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return document.DocumentListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.characterSummaries", spec.CharacterId)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return document.DocumentListResult{}, err
	}
	value, err := s.Reads.Character.ReadCharacterSummaries(ctx, actor, spec)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CharacterVerificationHistory(ctx context.Context, actor auth.Authority, spec CharacterVerificationHistorySpec) (member.VerificationPage, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return member.VerificationPage{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return member.VerificationPage{}, err
	}
	parent, err := s.parentRead(ctx, actor, spec.CharacterId)
	if err != nil {
		return member.VerificationPage{}, err
	}
	request, err := auth.ForCharacter("Query.characterVerificationHistory", auth.CharacterFacts{ID: parent.Id, OwnerID: parent.OwnerId})
	if err != nil {
		return member.VerificationPage{}, err
	}
	observe, err := s.authorizeRead(ctx, actor, request, spec.CharacterId)
	if err != nil {
		return member.VerificationPage{}, err
	}
	value, err := s.Reads.Character.ReadCharacterVerificationHistory(ctx, actor, spec)
	if err != nil {
		return member.VerificationPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Characters(ctx context.Context, actor auth.Authority, spec CharactersSpec) (CharacterV2ListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return CharacterV2ListResult{}, err
	}
	if spec.Filters != nil {
		if spec.Filters.RegionId != nil {
			if err := characterQueryID(*spec.Filters.RegionId); err != nil {
				return CharacterV2ListResult{}, err
			}
		}
		if spec.Filters.OwnerId != nil {
			if err := characterQueryID(*spec.Filters.OwnerId); err != nil {
				return CharacterV2ListResult{}, err
			}
		}
		if spec.Filters.GuildId != nil {
			if err := characterQueryID(*spec.Filters.GuildId); err != nil {
				return CharacterV2ListResult{}, err
			}
		}
		if spec.Filters.NamePrefix != nil {
			if err := characterQueryText(*spec.Filters.NamePrefix, 200); err != nil {
				return CharacterV2ListResult{}, err
			}
		}
		if spec.Filters.Status != nil {
			switch *spec.Filters.Status {
			case "active", "retired", "dead", "pending_approval":
			default:
				return CharacterV2ListResult{}, apierr.New(apierr.Invalid, "invalid character status")
			}
		}
	}
	observe, err := s.publicRead(ctx, actor, "Query.characters", "")
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	value, err := s.Reads.Character.ReadCharacters(ctx, actor, spec)
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	value.Items, err = s.projectCharacters(ctx, actor, value.Items)
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CoPlayers(ctx context.Context, actor auth.Authority, spec CoPlayersSpec) (CoPlayerPage, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return CoPlayerPage{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return CoPlayerPage{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.coPlayers", spec.CharacterId)
	if err != nil {
		return CoPlayerPage{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return CoPlayerPage{}, err
	}
	value, err := s.Reads.Character.ReadCoPlayers(ctx, actor, spec)
	if err != nil {
		return CoPlayerPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CreationCatalog(ctx context.Context, actor auth.Authority, spec CreationCatalogSpec) (CreationCatalogPage, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return CreationCatalogPage{}, err
	}
	if spec.Filters != nil && spec.Filters.RegionId != nil {
		if err := characterQueryID(*spec.Filters.RegionId); err != nil {
			return CreationCatalogPage{}, err
		}
	}
	request := auth.ForCreationCatalog(spec.Filters != nil && spec.Filters.IncludeAll)
	observe, err := s.authorizeRead(ctx, actor, request, "")
	if err != nil {
		return CreationCatalogPage{}, err
	}
	value, err := s.Reads.Reference.ReadCreationCatalog(ctx, actor, spec)
	if err != nil {
		return CreationCatalogPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DowntimeProjects(ctx context.Context, actor auth.Authority, spec DowntimeProjectsSpec) (DowntimeProjectListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return DowntimeProjectListResult{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return DowntimeProjectListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.downtimeProjects", spec.CharacterId)
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return DowntimeProjectListResult{}, err
	}
	value, err := s.Reads.Character.ReadDowntimeProjects(ctx, actor, spec)
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) MyCharacters(ctx context.Context, actor auth.Authority, spec MyCharactersSpec) (CharacterV2ListResult, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return CharacterV2ListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.myCharacters", "")
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	value, err := s.Reads.Character.ReadMyCharacters(ctx, actor, spec)
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	value.Items, err = s.projectCharacters(ctx, actor, value.Items)
	if err != nil {
		return CharacterV2ListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) MyQuestRewards(ctx context.Context, actor auth.Authority, spec MyQuestRewardsSpec) (RewardEntitlementPage, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return RewardEntitlementPage{}, err
	}
	if spec.Status != nil && *spec.Status != RewardClaimStatusClaimed && *spec.Status != RewardClaimStatusUnclaimed {
		return RewardEntitlementPage{}, apierr.New(apierr.Invalid, "invalid reward status")
	}
	observe, err := s.publicRead(ctx, actor, "Query.myQuestRewards", "")
	if err != nil {
		return RewardEntitlementPage{}, err
	}
	value, err := s.Reads.Character.ReadMyQuestRewards(ctx, actor, spec)
	if err != nil {
		return RewardEntitlementPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) ParticipationsByCharacter(ctx context.Context, actor auth.Authority, spec ParticipationsByCharacterSpec) (ParticipationPageView, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return ParticipationPageView{}, err
	}
	if err := characterQueryID(spec.CharacterId); err != nil {
		return ParticipationPageView{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.participationsByCharacter", spec.CharacterId)
	if err != nil {
		return ParticipationPageView{}, err
	}
	if _, err := s.parentRead(ctx, actor, spec.CharacterId); err != nil {
		return ParticipationPageView{}, err
	}
	value, err := s.Reads.Character.ReadParticipationsByCharacter(ctx, actor, spec)
	if err != nil {
		return ParticipationPageView{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) PendingCharacterVerifications(ctx context.Context, actor auth.Authority, spec PendingCharacterVerificationsSpec) (AdminCharacterDirectoryView, error) {
	if err := characterQueryPage(spec.Limit, spec.Offset); err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.pendingCharacterVerifications", "")
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	value, err := s.Reads.Character.ReadPendingCharacterVerifications(ctx, actor, spec)
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) BatchCharacters(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[CharacterView], error) {
	observe, err := s.publicRead(ctx, actor, "Query.character", "")
	if err != nil {
		return nil, err
	}
	out := make([]product.BatchResult[CharacterView], len(keys))
	valid := make([]IDKey, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		if err := characterQueryID(key.ID); err != nil {
			out[i].Err = err
			continue
		}
		valid = append(valid, key)
		positions = append(positions, i)
	}
	if len(valid) == 0 {
		return out, nil
	}
	values, err := s.Reads.Batch.ReadBatchCharacters(ctx, actor, valid)
	if err != nil {
		return nil, err
	}
	if len(values) != len(valid) {
		return nil, apierr.New(apierr.Internal, "character batch correspondence mismatch")
	}
	items := make([]CharacterView, 0, len(values))
	indices := make([]int, 0, len(values))
	for i, value := range values {
		out[positions[i]] = value
		if value.Err == nil && value.Value != nil {
			items = append(items, *value.Value)
			indices = append(indices, positions[i])
		}
	}
	projected, err := s.projectCharacters(ctx, actor, items)
	if err != nil {
		return nil, err
	}
	for i, value := range projected {
		out[indices[i]].Value = &value
	}
	if len(projected) > 0 {
		observe()
	}
	return out, nil
}

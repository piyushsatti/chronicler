package member

import (
	"fmt"
	"slices"
	"strings"
)

type GrantedUnlockProjection struct {
	AchievementNames []string
	DMTier           string
}

type GrantReconciler interface {
	Project(catalog []UnlockableView, grants []MemberUnlockView) (GrantedUnlockProjection, error)
}

type PureGrantReconciler struct{}

func NewGrantReconciler() *PureGrantReconciler {
	return &PureGrantReconciler{}
}

func (*PureGrantReconciler) Project(catalog []UnlockableView, grants []MemberUnlockView) (GrantedUnlockProjection, error) {
	byID := make(map[string]UnlockableView, len(catalog))
	for _, unlockable := range catalog {
		byID[unlockable.Id] = unlockable
	}
	for _, grant := range grants {
		if _, exists := byID[grant.UnlockableId]; !exists {
			return GrantedUnlockProjection{}, fmt.Errorf("grant projection catalog dependency missing for unlockable %q", grant.UnlockableId)
		}
	}

	ordered := slices.Clone(grants)
	slices.SortFunc(ordered, func(a, b MemberUnlockView) int {
		if a.UnlockedAt.After(b.UnlockedAt) {
			return -1
		}
		if a.UnlockedAt.Before(b.UnlockedAt) {
			return 1
		}
		return strings.Compare(b.UnlockableId, a.UnlockableId)
	})

	projection := GrantedUnlockProjection{AchievementNames: []string{}}
	hasTier := false
	for _, grant := range ordered {
		unlockable := byID[grant.UnlockableId]
		switch unlockable.Kind {
		case UnlockKindAchievement:
			projection.AchievementNames = append(projection.AchievementNames, unlockable.Name)
		case UnlockKindDmTier:
			if !hasTier {
				projection.DMTier = unlockable.Name
				hasTier = true
			}
		}
	}
	return projection, nil
}

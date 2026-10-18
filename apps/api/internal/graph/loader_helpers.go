package graph

import (
	"context"
	"errors"
	"fmt"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func requestLoaders(ctx context.Context) (*RequestLoaders, error) {
	state, ok := RequestStateFromContext(ctx)
	if !ok || state == nil || state.Loaders == nil {
		return nil, errors.New("request loaders unavailable")
	}
	return state.Loaders, nil
}

func requireLoader[K comparable, V any](loader *Loader[K, V], name string) (*Loader[K, V], error) {
	if loader == nil || loader.Load == nil {
		return nil, fmt.Errorf("%s loader unavailable", name)
	}
	return loader, nil
}

func canSeeDocumentAudience(actor auth.Authority, authorID string) bool {
	if actor.Claims().Anonymous() {
		return false
	}
	if actor.Claims().Has(auth.Admin) || actor.IsPlatformOwner() {
		return true
	}
	return actor.Claims().MemberID == authorID
}

func canSeeDiscordID(actor auth.Authority, memberID string) bool {
	if actor.Claims().Anonymous() {
		return false
	}
	if actor.Claims().Has(auth.Admin) || actor.IsPlatformOwner() {
		return true
	}
	return actor.Claims().MemberID == memberID
}

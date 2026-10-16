package auth

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"testing"
)

func TestPhase3TaskP05Acceptance(t *testing.T) {
	for _, owner := range []string{"", policyOther} {
		actor, err := NewAuthorityWithOwner(policyActor, []Role{Admin}, "active", "draft", "live-handle", owner)
		if err != nil || actor.IsPlatformOwner() {
			t.Fatalf("role/config granted owner %+v %v", actor, err)
		}
	}
	for _, roles := range [][]Role{{Player}, {DM}, {Archon, Lieutenant, Verifier}, {Admin}} {
		actor, err := NewAuthorityWithOwner(policyActor, roles, "active", "approved", "live-handle", policyActor)
		if err != nil || !actor.IsPlatformOwner() || actor.Handle() != "live-handle" {
			t.Fatalf("live owner not resolved %+v %v", actor, err)
		}
		if len(actor.Claims().Roles) != len(roles) {
			t.Fatal("owner fabricated role")
		}
	}
	for _, status := range []string{"missing", "inactive", "deleted"} {
		actor, err := NewAuthorityWithOwner(policyActor, []Role{Admin}, status, "approved", "live-handle", policyActor)
		policyCheckError(t, err, apierr.Forbidden)
		if actor.IsPlatformOwner() {
			t.Fatal("inactive owner admitted")
		}
	}
	for _, owner := range []string{"not-a-uuid", "10000000-0000-4000-8000-00000000000A"} {
		_, err := NewAuthorityWithOwner(policyActor, []Role{Player}, "active", "draft", "live-handle", owner)
		policyCheckError(t, err, apierr.Internal)
	}
	legacy, err := NewAuthorityWithHandle(policyActor, []Role{Admin}, "active", "approved", "handle")
	if err != nil || legacy.IsPlatformOwner() {
		t.Fatalf("legacy constructor owner %+v %v", legacy, err)
	}
	if (Authority{}).IsPlatformOwner() {
		t.Fatal("zero authority has owner privilege")
	}
}

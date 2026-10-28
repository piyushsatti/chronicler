package graph

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func TestPointcrawlNodeStateMapsBetweenWireAndStorage(t *testing.T) {
	for _, tc := range []struct {
		stored string
		wire   PointcrawlNodeState
	}{
		{spatial.PointcrawlNodeLocked, PointcrawlNodeStateLocked},
		{spatial.PointcrawlNodeUnlocked, PointcrawlNodeStateUnlocked},
		{spatial.PointcrawlNodeMapped, PointcrawlNodeStateMapped},
	} {
		if got := toPointcrawlNodeType(spatial.PointcrawlNodeView{State: tc.stored}).State; got != tc.wire {
			t.Errorf("stored %q mapped to %q, want %q", tc.stored, got, tc.wire)
		}
		if got := toSpatialPointcrawlNodeState(tc.wire); got != tc.stored {
			t.Errorf("wire %q mapped to %q, want %q", tc.wire, got, tc.stored)
		}
	}
	if got := toSpatialPointcrawlNodeState(PointcrawlNodeState("HIDDEN")); got != "" {
		t.Errorf("unknown wire state mapped to %q, want empty for command rejection", got)
	}
}

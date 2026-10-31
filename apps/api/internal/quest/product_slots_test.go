package quest

import (
	"context"
	"fmt"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestUpdateQuestRejectsSlotsOutsideDatabaseBounds(t *testing.T) {
	for _, slots := range []int32{0, -1, 101} {
		t.Run(fmt.Sprint(slots), func(t *testing.T) {
			spec := UpdateQuestSpec{Id: "0193b6a4-7c2e-7d4f-9a6b-2f6d3c1e8a90", Input: QuestEditFields{
				SlotsMax: product.Optional[int32]{Set: true, Value: &slots},
			}}
			_, err := ProductCommands{}.UpdateQuest(context.Background(), auth.Authority{}, spec, product.CommandMeta{})
			requireInvalid(t, err, "invalid quest schedule")
		})
	}
}

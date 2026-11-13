package spatial

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// ErrTimeAnchorUncovered is no anchor on or before the first projected date.
// Commands stay invalid input. Maintenance parks it instead of retrying to dead.
var ErrTimeAnchorUncovered = errors.New("time anchor must cover every projected date")

const timeProjectionDays = 30

func admitLockedTimeCommand(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation) error {
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return apierr.New(apierr.Forbidden, "member authority changed")
	}
	request, err := auth.ForOperation(operation)
	if err != nil {
		return err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "time command forbidden")
	}
	return nil
}

func timeProjectionRange(at time.Time) (product.Date, product.Date) {
	today := at.UTC()
	return product.Date(today.Format("2006-01-02")), product.Date(today.AddDate(0, 0, timeProjectionDays).Format("2006-01-02"))
}

func projectTimeCells(from, to product.Date, anchors []TimeAnchorView) ([]GameDayCellView, error) {
	start, err := time.Parse("2006-01-02", string(from))
	if err != nil {
		return nil, apierr.New(apierr.Invalid, "invalid time projection range")
	}
	end, err := time.Parse("2006-01-02", string(to))
	if err != nil || !start.Before(end) || end.After(start.AddDate(0, 0, 366)) {
		return nil, apierr.New(apierr.Invalid, "invalid time projection range")
	}
	cells := make([]GameDayCellView, 0, timeProjectionDays)
	index := -1
	for date := start; date.Before(end); date = date.AddDate(0, 0, 1) {
		for index+1 < len(anchors) && !anchors[index+1].RealUtc.After(date) {
			index++
		}
		if index < 0 {
			return nil, fmt.Errorf("%w: %w", ErrTimeAnchorUncovered, apierr.New(apierr.Invalid, ErrTimeAnchorUncovered.Error()))
		}
		day, err := computeGameDay(date, anchors[index])
		if err != nil {
			return nil, err
		}
		cells = append(cells, GameDayCellView{RealDate: product.Date(date.Format("2006-01-02")), GameDay: &day})
	}
	return cells, nil
}

func materializeTime(ctx context.Context, repository TimeWriteRepository, at time.Time) (int32, error) {
	from, to := timeProjectionRange(at)
	anchors, err := repository.LockTimeProjection(ctx, from, to)
	if err != nil {
		return 0, err
	}
	cells, err := projectTimeCells(from, to, anchors)
	if err != nil {
		return 0, err
	}
	return repository.StoreTimeProjection(ctx, from, to, cells)
}

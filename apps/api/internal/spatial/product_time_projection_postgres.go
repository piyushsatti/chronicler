package spatial

import (
	"context"
	"encoding/json"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) LockTimeProjection(ctx context.Context, from, to product.Date) ([]TimeAnchorView, error) {
	start, err := pgDateFromProduct(from)
	if err != nil {
		return nil, err
	}
	end, err := pgDateFromProduct(to)
	if err != nil {
		return nil, err
	}
	if err := p.queries().LockProductTimeAggregate(ctx); err != nil {
		return nil, err
	}
	rows, err := p.queries().ReadProductTimeProjectionAnchors(ctx, dbgen.ReadProductTimeProjectionAnchorsParams{RealFrom: start, RealTo: end})
	if err != nil {
		return nil, err
	}
	anchors := make([]TimeAnchorView, 0, len(rows))
	for _, row := range rows {
		anchors = append(anchors, mapTimeAnchorRow(row.ID, row.RealUtc, row.EpochDay, row.Rate, row.Note))
	}
	return anchors, nil
}

func (p *ProductPostgres) StoreTimeProjection(ctx context.Context, from, to product.Date, cells []GameDayCellView) (int32, error) {
	start, err := pgDateFromProduct(from)
	if err != nil {
		return 0, err
	}
	end, err := pgDateFromProduct(to)
	if err != nil {
		return 0, err
	}
	type projectionRow struct {
		RealDate product.Date `json:"real_date"`
		GameDay  *int32       `json:"game_day"`
	}
	rows := make([]projectionRow, len(cells))
	for i, cell := range cells {
		rows[i] = projectionRow{RealDate: cell.RealDate, GameDay: cell.GameDay}
	}
	payload, err := json.Marshal(rows)
	if err != nil {
		return 0, err
	}
	return p.queries().ReplaceProductGameTimeMapRange(ctx, dbgen.ReplaceProductGameTimeMapRangeParams{Rows: payload, Today: start, ToDate: end})
}

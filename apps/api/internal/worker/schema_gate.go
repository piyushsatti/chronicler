package worker

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type SchemaCompatibilityError struct {
	Have int64
	Min  int64
	Max  int64
}

func (e *SchemaCompatibilityError) Error() string {
	return fmt.Sprintf("schema version %d is outside supported range [%d,%d]", e.Have, e.Min, e.Max)
}

type SchemaGate struct {
	min int64
	max int64
}

func NewSchemaGate(min, max int64) (*SchemaGate, error) {
	if min <= 0 || max < min {
		return nil, errors.New("positive ordered schema compatibility bounds are required")
	}
	return &SchemaGate{min: min, max: max}, nil
}

func (g *SchemaGate) Check(ctx context.Context, db jobs.SQLExecutor) error {
	if g == nil || g.min <= 0 || g.max < g.min {
		return errors.New("initialized schema compatibility gate is required")
	}
	if ctx == nil {
		return errors.New("schema compatibility context is required")
	}
	if db == nil {
		return errors.New("schema compatibility database executor is required")
	}
	v := reflect.ValueOf(db)
	switch v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		if v.IsNil() {
			return errors.New("schema compatibility database executor is required")
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var have int64
	err := db.QueryRow(ctx, `
SELECT COALESCE((
    SELECT version_id
    FROM (
        SELECT DISTINCT ON (version_id) id, version_id, is_applied
        FROM goose_db_version
        ORDER BY version_id, id DESC
    ) latest
    WHERE is_applied
    ORDER BY id DESC
    LIMIT 1
), 0)`).Scan(&have)
	if err != nil {
		return err
	}
	if have < g.min || have > g.max {
		return &SchemaCompatibilityError{Have: have, Min: g.min, Max: g.max}
	}
	return nil
}

var _ jobs.CompatibilityGate = (*SchemaGate)(nil)

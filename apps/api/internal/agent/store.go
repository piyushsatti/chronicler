package agent

import (
	"context"
	"encoding/json"
)

type Store interface {
	Create(ctx context.Context, req QuestionRequested) error
	Get(ctx context.Context, jobID string) (state string, result json.RawMessage, ok bool, err error)
	Complete(ctx context.Context, result QuestionResult) error
}

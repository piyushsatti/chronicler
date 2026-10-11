package agent

import (
	"context"
	"encoding/json"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type Store interface {
	Create(context.Context, QuestionRequested) error
	Get(context.Context, string) (string, json.RawMessage, bool, error)
	Claim(context.Context) (ClaimedQuestion, bool, error)
	Complete(context.Context, QuestionCompletion) error
	Renew(context.Context, string, string) (jobs.Lease, error)
	Retry(context.Context, string, string, string) error
}

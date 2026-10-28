package jobs

import (
	"bytes"
	"encoding/json"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"io"
	"math"
	"math/big"
	"strconv"
	"strings"
	"time"
)

const AgentLease = 30 * time.Second
const GenericLease = 120 * time.Second
const QuestionBudget = 100 * time.Second

var ErrLease = apierr.New(apierr.Conflict, "lease is expired, superseded, or already released")
var ErrMissing = apierr.New(apierr.NotFound, "job not found")

type Receipt struct {
	ID    string
	Token string
}
type Lease struct {
	Token                  string    `json:"token"`
	Attempt                int       `json:"attempt"`
	ExpiresAt              time.Time `json:"expires_at"`
	RenewAfterSeconds      int       `json:"renew_after_seconds"`
	AttemptDeadlineAt      time.Time `json:"attempt_deadline_at"`
	RemainingBudgetSeconds float64   `json:"remaining_budget_seconds"`
}

func ParseToken(s string) (int64, error) {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n < 1 || strconv.FormatInt(n, 10) != s {
		return 0, apierr.New(apierr.Invalid, "lease_token must be a positive decimal int64 string")
	}
	return n, nil
}
func (j Job) Receipt() Receipt { return Receipt{j.ID, strconv.FormatInt(j.Token, 10)} }
func (j Job) leaseDuration() time.Duration {
	if j.Kind == "agent_question" {
		return AgentLease
	}
	return GenericLease
}
func (j Job) Lease(now time.Time) Lease {
	return Lease{strconv.FormatInt(j.Token, 10), j.Attempts, j.LeaseExpiresAt, int(j.leaseDuration().Seconds() / 3), j.AttemptDeadlineAt, max(0, j.AttemptDeadlineAt.Sub(now).Seconds())}
}
func (j Job) terminal() bool {
	return j.State == Succeeded || j.State == Dead || j.State == RepairRequired || j.State == Cancelled
}
func (j *Job) clearLease() {
	j.LeaseExpiresAt = time.Time{}
	j.ClaimedAt = time.Time{}
	j.AttemptDeadlineAt = time.Time{}
}
func FailurePayload(id, message string) []byte {
	b, _ := json.Marshal(map[string]any{"version": 1, "type": "question.failed", "job_id": id, "message": message})
	return b
}
func (j *Job) terminate(state State, op, message string) {
	j.State = state
	j.CompletionOperation = op
	j.ErrorMessage = message
	j.clearLease()
	j.CompletionPayload = []byte(`{}`)
	if j.Kind == "agent_question" {
		j.CompletionPayload = FailurePayload(j.PublicID, message)
	}
}
func (j *Job) ExpireQuestion(now time.Time) bool {
	if !j.terminal() && !j.QuestionDeadlineAt.IsZero() && !now.Before(j.QuestionDeadlineAt) {
		j.terminate(Dead, "deadline", "This request exceeded its time limit. Please try again.")
		return true
	}
	return false
}
func (j *Job) Claim(now time.Time) (bool, error) {
	if j.ExpireQuestion(now) {
		return false, nil
	}
	if j.State == Running {
		if now.Before(j.LeaseExpiresAt) {
			return false, nil
		}
	} else if (j.State != Queued && j.State != RetryWait) || now.Before(j.NextRunAt) {
		return false, nil
	}
	if j.Attempts >= MaxAttempts {
		j.terminate(Dead, "exhausted", "This request could not be completed. Please try again.")
		return false, nil
	}
	if j.Token == math.MaxInt64 {
		return false, apierr.New(apierr.Internal, "lease token exhausted")
	}
	j.Token++
	j.Attempts++
	j.State = Running
	j.ClaimedAt = now
	j.AttemptDeadlineAt = now.Add(10 * time.Minute)
	if !j.QuestionDeadlineAt.IsZero() {
		j.AttemptDeadlineAt = j.QuestionDeadlineAt
	}
	j.LeaseExpiresAt = minTime(now.Add(j.leaseDuration()), j.AttemptDeadlineAt)
	j.CompletionOperation = ""
	j.CompletionPayload = nil
	j.ErrorMessage = ""
	j.SafeErrorCode = ""
	return true, nil
}
func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
func (j Job) owns(token int64, now time.Time) bool {
	return j.State == Running && j.Token == token && now.Before(j.LeaseExpiresAt) && now.Before(j.AttemptDeadlineAt) && (j.QuestionDeadlineAt.IsZero() || now.Before(j.QuestionDeadlineAt))
}
func (j *Job) Renew(token int64, now time.Time) error {
	if !j.owns(token, now) {
		return ErrLease
	}
	j.LeaseExpiresAt = minTime(now.Add(j.leaseDuration()), j.AttemptDeadlineAt)
	return nil
}
func EqualJSON(a, b []byte) bool {
	var x, y any
	da, db := json.NewDecoder(bytes.NewReader(a)), json.NewDecoder(bytes.NewReader(b))
	da.UseNumber()
	db.UseNumber()
	if da.Decode(&x) != nil || db.Decode(&y) != nil {
		return false
	}
	var extra any
	if da.Decode(&extra) != io.EOF || db.Decode(&extra) != io.EOF {
		return false
	}
	return equalJSONValue(x, y)
}

// JSONB preserves numeric value but can change exponent/scale spelling. Compare
// exact decimal coefficients and powers of ten, without float64 rounding or
// expanding an untrusted exponent into an enormous integer or rational.
func decimalParts(n json.Number) (string, *big.Int) {
	s := string(n)
	exponent := new(big.Int)
	if i := strings.IndexAny(s, "eE"); i >= 0 {
		exponent.SetString(s[i+1:], 10)
		s = s[:i]
	}
	negative := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	fraction := 0
	if i := strings.IndexByte(s, '.'); i >= 0 {
		fraction = len(s) - i - 1
		s = s[:i] + s[i+1:]
	}
	s = strings.TrimLeft(s, "0")
	if s == "" {
		return "0", new(big.Int)
	}
	digits := strings.TrimRight(s, "0")
	exponent.Add(exponent, big.NewInt(int64(len(s)-len(digits)-fraction)))
	if negative {
		digits = "-" + digits
	}
	return digits, exponent
}
func equalJSONValue(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case json.Number:
		return equalJSONNumber(x, b)
	case []any:
		return equalJSONArray(x, b)
	case map[string]any:
		return equalJSONObject(x, b)
	default:
		return false
	}
}

func equalJSONNumber(value json.Number, other any) bool {
	otherNumber, ok := other.(json.Number)
	if !ok {
		return false
	}
	coefficient, exponent := decimalParts(value)
	otherCoefficient, otherExponent := decimalParts(otherNumber)
	return coefficient == otherCoefficient && exponent.Cmp(otherExponent) == 0
}

func equalJSONArray(values []any, other any) bool {
	items, ok := other.([]any)
	if !ok || len(values) != len(items) {
		return false
	}
	for i, value := range values {
		if !equalJSONValue(value, items[i]) {
			return false
		}
	}
	return true
}

func equalJSONObject(values map[string]any, other any) bool {
	items, ok := other.(map[string]any)
	if !ok || len(values) != len(items) {
		return false
	}
	for key, value := range values {
		item, ok := items[key]
		if !ok || !equalJSONValue(value, item) {
			return false
		}
	}
	return true
}

func (j *Job) Finish(token int64, now time.Time, op string, state State, payload []byte, after time.Duration, reason string) error {
	if j.completionReplay(token, op, state, payload) {
		return nil
	}
	if !j.owns(token, now) {
		return ErrLease
	}
	if op == "retry" {
		return j.retry(now, after, reason)
	}
	if err := validateCompletionState(op, state); err != nil {
		return err
	}
	j.State = state
	j.CompletionOperation = op
	j.CompletionPayload = payload
	j.ErrorMessage = reason
	j.clearLease()
	return nil
}

// FailWithCode is the "fail" completion plus a safe error code. An empty code
// leaves SafeErrorCode as it was, so plain failures behave exactly as Finish.
func (j *Job) FailWithCode(token int64, now time.Time, state State, payload []byte, reason, safeCode string) error {
	if j.completionReplay(token, "fail", state, payload) {
		return nil
	}
	if err := j.Finish(token, now, "fail", state, payload, 0, reason); err != nil {
		return err
	}
	if safeCode != "" {
		j.SafeErrorCode = safeCode
	}
	return nil
}

func (j *Job) completionReplay(token int64, op string, state State, payload []byte) bool {
	return (op == "succeed" || op == "fail") && j.Token == token && j.terminal() && j.State == state && j.CompletionOperation == op && EqualJSON(j.CompletionPayload, payload)
}

func validateCompletionState(op string, state State) error {
	switch op {
	case "succeed":
		if state != Succeeded {
			return apierr.New(apierr.Invalid, "invalid success state")
		}
	case "fail":
		if state != Dead && state != RepairRequired {
			return apierr.New(apierr.Invalid, "invalid failure state")
		}
	default:
		return apierr.New(apierr.Invalid, "invalid completion operation")
	}
	return nil
}

func (j *Job) retry(now time.Time, after time.Duration, reason string) error {
	if j.Attempts >= MaxAttempts {
		j.terminate(Dead, "exhausted", "This request could not be completed. Please try again.")
		return nil
	}
	j.State = RetryWait
	j.NextRunAt = now.Add(after)
	j.ErrorMessage = reason
	j.clearLease()
	return nil
}
func (j *Job) Cancel() error {
	if j.terminal() {
		return ErrLease
	}
	j.terminate(Cancelled, "cancel", "This request was cancelled.")
	return nil
}

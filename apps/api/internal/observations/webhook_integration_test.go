package observations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

const ob05FixtureEndpoint = "https://discord.com/api/v10/webhooks/150/PRIVATE_FIXTURE_TOKEN"

func ob05Message() AlertMessage {
	return AlertMessage{Transition: AlertTransition{Key: "worker:heartbeat", Kind: "WORKER_HEARTBEAT_STALE", State: "OPEN", SafeSummary: "Worker heartbeat missing or stale", Version: 1, ObservedAt: time.Date(2026, 10, 14, 0, 15, 0, 0, time.UTC)}}
}
func ob05Raw(t *testing.T, v any) []byte {
	t.Helper()
	b, e := json.Marshal(v)
	if e != nil {
		t.Fatal(e)
	}
	return b
}

type ob05RoundTrip func(*http.Request) (*http.Response, error)

func (fn ob05RoundTrip) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
func ob05Response(status int, header, body string) *http.Response {
	h := make(http.Header)
	if header != "" {
		h.Set("Retry-After", header)
	}
	return &http.Response{StatusCode: status, Header: h, Body: io.NopCloser(strings.NewReader(body))}
}

func TestOB05SourceSpecification(t *testing.T) {
	first := AlertConditionSpecification()
	first[0] = '!'
	if !json.Valid(AlertConditionSpecification()) {
		t.Fatal("caller mutated immutable specification")
	}
	rule := alertConditionRule()
	if rule.SchemaVersion != 1 || len(rule.Families) != 6 || !slices.Equal(rule.RegisteredScheduleKinds, []string{"gametime_fill", "reconcile_dry_run"}) || rule.Limits.ClaimedPayloadBytes != 4096 || rule.Limits.DiscordContentBytes != 2000 {
		t.Fatalf("unexpected rule %#v", rule)
	}
	fixture, err := os.ReadFile("../../cmd/api/testdata/product/mounted-query-output-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Conformance struct {
			Vectors []struct {
				ID        string          `json:"vector_id"`
				Payload   json.RawMessage `json:"payload"`
				Durable   bool            `json:"go_durable_valid"`
				Candidate *bool           `json:"go_candidate_valid"`
				Claimed   *bool           `json:"go_claimed_message_valid"`
				Direct    *bool           `json:"go_direct_send_valid"`
			}
		} `json:"alert_condition_conformance_vectors"`
	}
	if err := json.Unmarshal(fixture, &document); err != nil {
		t.Fatal(err)
	}
	if len(document.Conformance.Vectors) < 28 {
		t.Fatal("missing published conformance vectors")
	}
	for _, vector := range document.Conformance.Vectors {
		t.Run(vector.ID, func(t *testing.T) {
			_, err := decodeAlertTransition(vector.Payload, alertPersistedStage)
			if (err == nil) != vector.Durable {
				t.Fatalf("durable got %v expected %v", err, vector.Durable)
			}
			for _, stage := range []struct {
				name     string
				stage    alertValidationStage
				explicit *bool
			}{{"candidate", alertCandidateStage, vector.Candidate}, {"direct", alertDirectSendStage, vector.Direct}} {
				if stage.stage == alertCandidateStage && stage.explicit == nil && !vector.Durable {
					continue
				}
				want := vector.Durable
				if stage.explicit != nil {
					want = *stage.explicit
				}
				_, err := decodeAlertTransition(vector.Payload, stage.stage)
				if (err == nil) != want {
					t.Fatalf("%s got %v expected %v", stage.name, err, want)
				}
			}
			if !vector.Durable && vector.Claimed == nil {
				return
			}
			var transition AlertTransition
			if json.Unmarshal(vector.Payload, &transition) != nil {
				return
			}
			message := AlertMessage{Transition: transition}
			if match, err := validateAlertTransition(transition, alertPersistedStage); err == nil {
				message.JobID = match.JobID
				message.Slot = match.Slot
			}
			want := vector.Durable
			if vector.Claimed != nil {
				want = *vector.Claimed
			}
			_, err = decodeAlertMessage(ob05Raw(t, message))
			if (err == nil) != want {
				t.Fatalf("claimed got %v expected %v", err, want)
			}
		})
	}
	t.Run("candidate expected version zero", func(t *testing.T) {
		m := ob05Message()
		m.Transition.Version = 0
		if _, e := validateAlertTransition(m.Transition, alertCandidateStage); e != nil {
			t.Fatal(e)
		}
		if validateAlertMessage(m, alertPersistedStage) == nil {
			t.Fatal("unassigned durable version admitted")
		}
	})
}

func TestOB05SourceCodec(t *testing.T) {
	raw := ob05Raw(t, ob05Message())
	if _, e := decodeAlertMessage(raw); e != nil {
		t.Fatal(e)
	}
	for _, tc := range []struct {
		name string
		raw  []byte
	}{
		{"lower envelope", bytes.Replace(raw, []byte(`"Transition"`), []byte(`"transition"`), 1)},
		{"lower nested", bytes.Replace(raw, []byte(`"Key"`), []byte(`"key"`), 1)},
		{"null mandatory", bytes.Replace(raw, []byte(`"Version":1`), []byte(`"Version":null`), 1)},
		{"null transition", []byte(`{"Transition":null,"JobID":null,"Slot":null}`)},
		{"missing optional", bytes.Replace(raw, []byte(`,"Slot":null`), nil, 1)},
		{"unknown envelope", append(append([]byte{}, raw[:len(raw)-1]...), []byte(`,"Secret":"HIDDEN_TITLE_SENTINEL"}`)...)},
		{"unknown nested", bytes.Replace(raw, []byte(`"Version":1`), []byte(`"Version":1,"Secret":"HIDDEN_TITLE_SENTINEL"`), 1)},
		{"wrong summary", bytes.Replace(raw, []byte("Worker heartbeat missing or stale"), []byte("HIDDEN_TITLE_SENTINEL"), 1)},
		{"wrong job id", bytes.Replace(raw, []byte(`"JobID":null`), []byte(`"JobID":"150"`), 1)},
		{"wrong slot", bytes.Replace(raw, []byte(`"Slot":null`), []byte(`"Slot":"2026-10-14T00:00:00Z"`), 1)},
		{"fractional version", bytes.Replace(raw, []byte(`"Version":1`), []byte(`"Version":1.5`), 1)},
		{"overflow", bytes.Replace(raw, []byte(`"Version":1`), []byte(`"Version":9223372036854775808`), 1)},
		{"null time", bytes.Replace(raw, []byte(`"ObservedAt":"2026-10-14T00:15:00Z"`), []byte(`"ObservedAt":null`), 1)},
		{"trailing", append(append([]byte{}, raw...), []byte(` {}`)...)},
		{"scalar", []byte(`true`)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, e := decodeAlertMessage(tc.raw); e == nil {
				t.Fatal("invalid exact safe payload accepted")
			}
		})
	}
	for _, size := range []int{4096, 4097} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			padded := append(append([]byte{}, raw...), bytes.Repeat([]byte{' '}, size-len(raw))...)
			_, e := decodeAlertMessage(padded)
			if (e == nil) != (size == 4096) {
				t.Fatalf("boundary length%d error%v", size, e)
			}
		})
	}
	t.Run("same duplicate semantics as jsonb", func(t *testing.T) {
		duplicate := bytes.Replace(raw, []byte(`"Version":1`), []byte(`"Version":0,"Version":1`), 1)
		if _, e := decodeAlertMessage(duplicate); e != nil {
			t.Fatal(e)
		}
	})
	t.Run("slot actual instant and UUID correspondence", func(t *testing.T) {
		slot := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
		message := AlertMessage{Transition: AlertTransition{Key: "missed:gametime_fill:2026-10-14T00:00:00Z", Kind: "SCHEDULE_MISSED", State: "OPEN", SafeSummary: "Scheduled gametime_fill has not succeeded", Version: 1, ObservedAt: slot}, Slot: &slot}
		if _, e := decodeAlertMessage(ob05Raw(t, message)); e != nil {
			t.Fatal(e)
		}
		message.Slot = nil
		if _, e := decodeAlertMessage(ob05Raw(t, message)); e == nil {
			t.Fatal("missing required slot accepted")
		}
		id := "10000000-0000-4000-8000-000000000150"
		message = AlertMessage{Transition: AlertTransition{Key: "work:" + id, Kind: "TERMINAL_WORK_FAILURE", State: "OPEN", SafeSummary: "Work failed and requires attention", Version: 1, ObservedAt: slot}, JobID: &id}
		if _, e := decodeAlertMessage(ob05Raw(t, message)); e != nil {
			t.Fatal(e)
		}
		other := "10000000-0000-4000-8000-000000000151"
		message.JobID = &other
		if _, e := decodeAlertMessage(ob05Raw(t, message)); e == nil {
			t.Fatal("foreign UUID accepted")
		}
	})
	t.Run("ASCII content and no truncation", func(t *testing.T) {
		content, e := webhookContent(ob05Message())
		if e != nil || !alertASCII(strings.ReplaceAll(content, "\n", " ")) || len(content) > 2000 {
			t.Fatal(content, e)
		}
		message := ob05Message()
		message.Transition.SafeSummary = strings.Repeat("a", 2000)
		if _, e := webhookContent(message); e == nil {
			t.Fatal("oversize truncated or admitted")
		}
	})
}

func TestOB05SourceEndpoint(t *testing.T) {
	var calls atomic.Int32
	transport := ob05RoundTrip(func(*http.Request) (*http.Response, error) { calls.Add(1); return ob05Response(200, "", `{}`), nil })
	original := &http.Client{Transport: transport, Timeout: 19 * time.Second}
	for _, endpoint := range []string{"", ob05FixtureEndpoint, "https://DISCORD.COM:443/api/webhooks/1/a._~-9?wait=true", "https://discord.com/api/webhooks/18446744073709551615/token"} {
		webhook, e := NewDiscordWebhook(endpoint, original)
		if e != nil {
			t.Fatal(endpoint, e)
		}
		if webhook.Configured() != (endpoint != "") {
			t.Fatal("configuration status")
		}
		if webhook.client.Timeout != 5*time.Second || webhook.client.Transport == nil || webhook.client.CheckRedirect(nil, nil) != http.ErrUseLastResponse {
			t.Fatal("clone policy")
		}
	}
	if original.Timeout != 19*time.Second || original.CheckRedirect != nil || calls.Load() != 0 {
		t.Fatal("mutated client or performed I/O")
	}
	for _, endpoint := range []string{
		"http://discord.com/api/webhooks/1/token", "https://discord.com.evil.test/api/webhooks/1/token", "https://ptb.discord.com/api/webhooks/1/token", "https://discordapp.com/api/webhooks/1/token", "https://user:secret@discord.com/api/webhooks/1/token", "https://discord.com:444/api/webhooks/1/token", "https://discord.com:/api/webhooks/1/token", "https://discord.com/api/webhooks/0/token", "https://discord.com/api/webhooks/18446744073709551616/token", "https://discord.com/api/webhooks/-1/token", "https://discord.com/api/webhooks/1/", "https://discord.com/api/webhooks/1/.", "https://discord.com/api/webhooks/1/..", "https://discord.com/api/v9/webhooks/1/token", "https://discord.com/api/webhooks/1/token/", "https://discord.com/api/webhooks/1/token/extra", "https://discord.com/api/webhooks/1/%74oken", "https://discord.com/api/webhooks/1/token%25", "https://discord.com/api/webhooks/1/token#", "https://discord.com/api/webhooks/1/token?wait=false", "https://discord.com/api/webhooks/1/token?wait=true&wait=true", "https://discord.com/api/webhooks/1/token?thread_id=1", "https://discord.com/api/webhooks/1/token?x=true", "https://discord.com/api/webhooks/1/tok@en",
	} {
		t.Run(endpoint, func(t *testing.T) {
			_, e := NewDiscordWebhook(endpoint, original)
			if e == nil {
				t.Fatal("unsafe endpoint admitted")
			}
			if strings.Contains(e.Error(), "token") || strings.Contains(e.Error(), "secret") {
				t.Fatal("endpoint leaked")
			}
		})
	}
	if _, e := NewDiscordWebhook(ob05FixtureEndpoint, nil); e == nil {
		t.Fatal("nil client accepted")
	}
}

func TestOB05SourceHTTP(t *testing.T) {
	var seen atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.Add(1)
		if r.Method != http.MethodPost || r.URL.Query().Get("wait") != "true" {
			t.Error("provider acceptance request shape")
		}
		raw, e := io.ReadAll(r.Body)
		if e != nil {
			t.Error(e)
		}
		if bytes.Contains(raw, []byte("PRIVATE_FIXTURE_TOKEN")) || bytes.Contains(raw, []byte("HIDDEN_TITLE_SENTINEL")) {
			t.Error("unsafe body")
		}
		var envelope struct {
			Content  string `json:"content"`
			Mentions struct {
				Parse []string `json:"parse"`
			} `json:"allowed_mentions"`
		}
		if e := json.Unmarshal(raw, &envelope); e != nil || envelope.Content == "" || envelope.Mentions.Parse == nil || len(envelope.Mentions.Parse) != 0 {
			t.Error("unsafe mentions/envelope", e)
		}
		for _, value := range []string{"worker:heartbeat", "WORKER_HEARTBEAT_STALE", "OPEN", "Version: 1", "2026-10-14T00:15:00Z"} {
			if !strings.Contains(envelope.Content, value) {
				t.Error("required fact omitted", value)
			}
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"fixture"}`))
	}))
	defer server.Close()
	target, e := url.Parse(server.URL)
	if e != nil {
		t.Fatal(e)
	}
	client := server.Client()
	delegate := client.Transport
	client.Transport = ob05RoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != ob05FixtureEndpoint+"?wait=true" {
			t.Fatal("transport attempted unvalidated endpoint")
		}
		copy := r.Clone(r.Context())
		u := *r.URL
		copy.URL = &u
		copy.URL.Scheme = target.Scheme
		copy.URL.Host = target.Host
		copy.Host = target.Host
		return delegate.RoundTrip(copy)
	})
	webhook, e := NewDiscordWebhook(ob05FixtureEndpoint, client)
	if e != nil {
		t.Fatal(e)
	}
	if e := webhook.Send(context.Background(), ob05Message()); e != nil {
		t.Fatal(e)
	}
	if seen.Load() != 1 {
		t.Fatal("local server did not receive actual request")
	}
}

func TestOB05SourceProviderClassification(t *testing.T) {
	for _, tc := range []struct {
		name         string
		status       int
		header, body string
		permanent    bool
		after        time.Duration
		success      bool
	}{
		{"accepted", 204, "", "", false, 0, true}, {"two seconds", 429, "2", `{"retry_after":3}`, false, 2 * time.Second, false}, {"fraction header", 429, "0.125", `{"retry_after":3}`, false, 125 * time.Millisecond, false}, {"fraction body", 429, "bad", `{"retry_after":0.125}`, false, 125 * time.Millisecond, false}, {"tiny", 429, "0.0000000000001", `{}`, false, time.Nanosecond, false},
		{"underflow tiny", 429, "1e-400", `{}`, false, time.Nanosecond, false}, {"cap header", 429, "301", `{}`, false, 300 * time.Second, false}, {"cap body", 429, "", `{"retry_after":9999999}`, false, 300 * time.Second, false}, {"invalid header body fallback", 429, "NaN", `{"retry_after":2}`, false, 2 * time.Second, false}, {"malformed", 429, "bad", `{bad`, false, 0, false}, {"overflow", 429, "1e999", `{"retry_after":1e999}`, false, 0, false}, {"quoted body", 429, "", `{"retry_after":"2"}`, false, 0, false}, {"zero", 429, "0", `{"retry_after":0}`, false, 0, false}, {"negative", 429, "-2", `{"retry_after":-2}`, false, 0, false}, {"server", 500, "", `HIDDEN_TITLE_SENTINEL`, false, 0, false}, {"config", 401, "", `HIDDEN_TITLE_SENTINEL`, true, 0, false}, {"redirect", 302, "", ``, true, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) { return ob05Response(tc.status, tc.header, tc.body), nil })}
			webhook, e := NewDiscordWebhook(ob05FixtureEndpoint, client)
			if e != nil {
				t.Fatal(e)
			}
			e = webhook.Send(context.Background(), ob05Message())
			if tc.success {
				if e != nil {
					t.Fatal(e)
				}
				return
			}
			failure, ok := errors.AsType[*webhookFailure](e)
			if !ok || failure.permanent != tc.permanent || failure.after != tc.after {
				t.Fatalf("classification %v expected permanent%v after%v", e, tc.permanent, tc.after)
			}
			if strings.Contains(e.Error(), "HIDDEN_TITLE_SENTINEL") || strings.Contains(e.Error(), "PRIVATE_FIXTURE_TOKEN") {
				t.Fatal("provider data leaked")
			}
		})
	}
	t.Run("transport redaction", func(t *testing.T) {
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("PRIVATE_FIXTURE_TOKEN HIDDEN_TITLE_SENTINEL")
		})})
		e := webhook.Send(context.Background(), ob05Message())
		if e == nil || strings.Contains(e.Error(), "PRIVATE_FIXTURE_TOKEN") || strings.Contains(e.Error(), "HIDDEN_TITLE_SENTINEL") {
			t.Fatal("unsafe transport result", e)
		}
	})
	t.Run("configured false", func(t *testing.T) {
		webhook, _ := NewDiscordWebhook("", &http.Client{})
		e := webhook.Send(context.Background(), ob05Message())
		if e == nil || e.Error() != "ALERT_WEBHOOK_UNCONFIGURED" {
			t.Fatal(e)
		}
	})
}

// These explicit unit-store checks do not establish native ProcessOne acceptance.
type ob05UnitStore struct {
	job        jobs.Job
	lane       string
	finish     string
	reason     string
	receipt    jobs.Receipt
	delay      time.Duration
	claimError error
	now        time.Time
}

func (s *ob05UnitStore) Enqueue(context.Context, jobs.Job) error {
	return errors.New("unexpected unit enqueue")
}
func (s *ob05UnitStore) ClaimOne(_ context.Context, lane string) (jobs.Job, error) {
	s.lane = lane
	if s.claimError != nil {
		return jobs.Job{}, s.claimError
	}
	if s.job.ID == "" {
		return jobs.Job{}, nil
	}
	_, e := s.job.Claim(s.now)
	return s.job, e
}
func (s *ob05UnitStore) Renew(context.Context, jobs.Receipt) (jobs.Lease, error) {
	return jobs.Lease{}, errors.New("unexpected unit renewal")
}
func (s *ob05UnitStore) complete(receipt jobs.Receipt, op string, state jobs.State, delay time.Duration, reason string) error {
	s.receipt = receipt
	s.finish = op
	s.reason = reason
	s.delay = delay
	token, e := jobs.ParseToken(receipt.Token)
	if e != nil {
		return e
	}
	if op == "retry" && delay == 0 {
		delay = jobs.Backoff(s.job.Attempts)
		s.delay = delay
	}
	return s.job.Finish(token, s.now, op, state, []byte(`{}`), delay, reason)
}
func (s *ob05UnitStore) Succeed(_ context.Context, r jobs.Receipt) error {
	return s.complete(r, "succeed", jobs.Succeeded, 0, "")
}
func (s *ob05UnitStore) Retry(_ context.Context, r jobs.Receipt, d time.Duration, reason string) error {
	return s.complete(r, "retry", jobs.RetryWait, d, reason)
}
func (s *ob05UnitStore) Fail(_ context.Context, r jobs.Receipt, state jobs.State, reason string) error {
	return s.complete(r, "fail", state, 0, reason)
}
func (s *ob05UnitStore) FailWithCode(ctx context.Context, r jobs.Receipt, state jobs.State, reason, _ string) error {
	return s.Fail(ctx, r, state, reason)
}
func ob05Store(t *testing.T) *ob05UnitStore {
	return &ob05UnitStore{now: time.Now(), job: jobs.Job{ID: "150", PublicID: "10000000-0000-4000-8000-000000000150", Key: "operator-alert:worker:heartbeat:1", Kind: "operator_alert", Lane: "operator_alert", State: jobs.Queued, Payload: ob05Raw(t, ob05Message())}}
}
func TestOB05SourceProcessOneUnit(t *testing.T) {
	for _, tc := range []struct {
		name         string
		status       int
		header       string
		state        jobs.State
		reason       string
		delay        time.Duration
		attempts     int
		unconfigured bool
	}{
		{"accepted", 200, "", jobs.Succeeded, "", 0, 0, false}, {"429 exact2s", 429, "2", jobs.RetryWait, "OPERATOR_ALERT_RATE_LIMITED", 2 * time.Second, 0, false}, {"500 fallback", 500, "", jobs.RetryWait, "OPERATOR_ALERT_DELIVERY_FAILED", time.Second, 0, false}, {"401 repair", 401, "", jobs.RepairRequired, "INVALID_CONFIGURATION", 0, 0, false}, {"exhausted", 500, "", jobs.Dead, "OPERATOR_ALERT_DELIVERY_FAILED", 0, 7, false}, {"missing URL", 200, "", jobs.RepairRequired, "ALERT_WEBHOOK_UNCONFIGURED", 0, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := ob05Store(t)
			s.job.Attempts = tc.attempts
			var sends int
			endpoint := ob05FixtureEndpoint
			if tc.unconfigured {
				endpoint = ""
			}
			webhook, _ := NewDiscordWebhook(endpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) {
				sends++
				return ob05Response(tc.status, tc.header, `{}`), nil
			})})
			claimed, e := webhook.ProcessOne(context.Background(), s)
			if e != nil || !claimed || s.lane != "operator_alert" || s.job.State != tc.state || s.reason != tc.reason || s.delay != tc.delay || s.receipt.ID != "150" || s.receipt.Token != "1" {
				t.Fatalf("result claimed%v error%v store%+v", claimed, e, s)
			}
			if tc.unconfigured && sends != 0 {
				t.Fatal("unconfigured sent")
			}
		})
	}
	for _, tc := range []string{"wrong kind", "wrong lane", "malformed", "direct db"} {
		t.Run(tc, func(t *testing.T) {
			s := ob05Store(t)
			switch tc {
			case "wrong kind":
				s.job.Kind = "quest_discord_delivery"
			case "wrong lane":
				s.job.Lane = "discord"
			case "malformed":
				s.job.Payload = []byte(`{"secret":"HIDDEN_TITLE_SENTINEL"}`)
			case "direct db":
				message := ob05Message()
				message.Transition = AlertTransition{Key: "database:unavailable", Kind: "DB_UNAVAILABLE", State: "OPEN", SafeSummary: "Database unavailable", Version: 0, ObservedAt: s.now}
				s.job.Payload = ob05Raw(t, message)
			}
			webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) {
				t.Error("invalid job sent")
				return ob05Response(200, "", `{}`), nil
			})})
			claimed, e := webhook.ProcessOne(context.Background(), s)
			if !claimed || e != nil || s.job.State != jobs.RepairRequired || s.reason != "INVALID_CONFIGURATION" {
				t.Fatalf("%v %v %+v", claimed, e, s)
			}
		})
	}
	t.Run("stale completion is conflict", func(t *testing.T) {
		s := ob05Store(t)
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) { s.job.Token++; return ob05Response(200, "", `{}`), nil })})
		claimed, e := webhook.ProcessOne(context.Background(), s)
		expected, ok := errors.AsType[*apierr.Error](e)
		if !claimed || !ok || expected.Code != apierr.Conflict || s.job.State == jobs.Succeeded {
			t.Fatal("stale finish accepted", e)
		}
	})
	t.Run("empty nil and raw store failure", func(t *testing.T) {
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{})
		if claimed, e := webhook.ProcessOne(context.Background(), nil); claimed || e == nil {
			t.Fatal("nil accepted")
		}
		empty := &ob05UnitStore{}
		if claimed, e := webhook.ProcessOne(context.Background(), empty); claimed || e != nil || empty.lane != "operator_alert" {
			t.Fatal("empty lane", e)
		}
		empty.claimError = errors.New("PRIVATE_FIXTURE_TOKEN HIDDEN_TITLE_SENTINEL")
		if claimed, e := webhook.ProcessOne(context.Background(), empty); claimed || e == nil || strings.Contains(e.Error(), "PRIVATE_FIXTURE_TOKEN") || strings.Contains(e.Error(), "HIDDEN_TITLE_SENTINEL") {
			t.Fatal("unsafe claim error", e)
		}
	})
	t.Run("shutdown cancels and joins", func(t *testing.T) {
		s := ob05Store(t)
		entered := make(chan struct{})
		left := make(chan struct{})
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(r *http.Request) (*http.Response, error) {
			close(entered)
			<-r.Context().Done()
			close(left)
			return nil, r.Context().Err()
		})})
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan error, 1)
		go func() { _, e := webhook.ProcessOne(ctx, s); result <- e }()
		<-entered
		cancel()
		select {
		case e := <-result:
			if !errors.Is(e, context.Canceled) {
				t.Fatal(e)
			}
		case <-time.After(time.Second):
			t.Fatal("not joined")
		}
		select {
		case <-left:
		default:
			t.Fatal("work still running")
		}
		if s.finish != "" {
			t.Fatal("shutdown fabricated completion")
		}
	})
}

type ob05CountedBody struct {
	remaining int
	read      int
	closed    bool
}

func (body *ob05CountedBody) Read(p []byte) (int, error) {
	if body.remaining == 0 {
		return 0, io.EOF
	}
	n := min(len(p), body.remaining)
	for i := range n {
		p[i] = 'a'
	}
	body.remaining -= n
	body.read += n
	return n, nil
}
func (body *ob05CountedBody) Close() error { body.closed = true; return nil }
func TestOB05SourceResponseBounds(t *testing.T) {
	for _, status := range []int{200, 401, 429, 500} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			body := &ob05CountedBody{remaining: 1 << 20}
			client := &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) {
				h := make(http.Header)
				h.Set("Retry-After", "2")
				return &http.Response{StatusCode: status, Body: body, Header: h}, nil
			})}
			webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, client)
			err := webhook.Send(context.Background(), ob05Message())
			if body.read > (64<<10)+1 || !body.closed {
				t.Fatal("response body escaped bounded read/close", body)
			}
			if status == 200 {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			failure, ok := errors.AsType[*webhookFailure](err)
			if !ok {
				t.Fatal(err)
			}
			if status == 401 && !failure.permanent {
				t.Fatal("oversized body changed permanent 4xx classification")
			}
			if status == 429 && failure.after != 2*time.Second {
				t.Fatal("body overflow overrode valid preferred header")
			}
		})
	}
	t.Run("redirect not followed", func(t *testing.T) {
		var requests atomic.Int32
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) {
			requests.Add(1)
			response := ob05Response(302, "", "")
			response.Header.Set("Location", "https://other.example.test/PRIVATE_FIXTURE_TOKEN")
			return response, nil
		})})
		err := webhook.Send(context.Background(), ob05Message())
		failure, ok := errors.AsType[*webhookFailure](err)
		if !ok || !failure.permanent || requests.Load() != 1 {
			t.Fatal("redirect followed or misclassified", err, requests.Load())
		}
	})
	t.Run("nil concrete store", func(t *testing.T) {
		var store *ob05UnitStore
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{})
		if claimed, err := webhook.ProcessOne(context.Background(), store); claimed || err == nil {
			t.Fatal("nil store accepted")
		}
	})
	t.Run("diagnostic canonical shape is still a message", func(t *testing.T) {
		message := ob05Message()
		message.Transition = AlertTransition{Key: "operator:webhook:configuration", Kind: "ALERT_WEBHOOK_UNCONFIGURED", State: "OPEN", SafeSummary: "Operator webhook is not configured", Version: 1, ObservedAt: message.Transition.ObservedAt}
		store := ob05Store(t)
		store.job.Payload = ob05Raw(t, message)
		var requests int
		webhook, _ := NewDiscordWebhook(ob05FixtureEndpoint, &http.Client{Transport: ob05RoundTrip(func(*http.Request) (*http.Response, error) { requests++; return ob05Response(200, "", "{}"), nil })})
		claimed, err := webhook.ProcessOne(context.Background(), store)
		if !claimed || err != nil || requests != 1 || store.job.State != jobs.Succeeded {
			t.Fatal("coordinator enqueue rule became a new message ban", err)
		}
	})
}
func TestOB05SourceHTTPTimeout(t *testing.T) {
	entered := make(chan struct{})
	left := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		close(entered)
		select {
		case <-r.Context().Done():
		case <-release:
		}
		close(left)
	}))
	defer server.Close()
	defer close(release)
	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := server.Client()
	delegate := client.Transport
	client.Transport = ob05RoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != ob05FixtureEndpoint+"?wait=true" {
			return nil, errors.New("invalid fixture endpoint")
		}
		copy := r.Clone(r.Context())
		u := *r.URL
		copy.URL = &u
		copy.URL.Scheme = target.Scheme
		copy.URL.Host = target.Host
		copy.Host = target.Host
		return delegate.RoundTrip(copy)
	})
	webhook, err := NewDiscordWebhook(ob05FixtureEndpoint, client)
	if err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { result <- webhook.Send(context.Background(), ob05Message()) }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("server did not receive bounded request")
	}
	select {
	case err := <-result:
		failure, ok := errors.AsType[*webhookFailure](err)
		if !ok || failure.permanent || strings.Contains(err.Error(), "PRIVATE_FIXTURE_TOKEN") {
			t.Fatal("timeout classification", err)
		}
	case <-time.After(6 * time.Second):
		t.Fatal("5second clone timeout failed")
	}
	select {
	case <-left:
	case <-time.After(time.Second):
		t.Fatal("server request was not cancelled")
	}
}

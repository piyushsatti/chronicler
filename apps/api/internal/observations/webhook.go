package observations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

// This immutable Specification is interpreted by both Go and the owning named SQL.
const alertConditionSpecificationJSON = `{
 "schemaVersion":1,
 "registeredScheduleKinds":["gametime_fill","reconcile_dry_run"],
 "limits":{"claimedPayloadBytes":4096,"discordContentBytes":2000,"candidateMinVersion":0,"persistedMinVersion":1},
 "families":[
  {"kind":"WORKER_HEARTBEAT_STALE","keyMode":"literal","literalKey":"worker:heartbeat","keyPrefix":null,"summaries":{"OPEN":"Worker heartbeat missing or stale","RESOLVED":"Worker heartbeat observed"},"durableStates":["OPEN","RESOLVED"],"jobIDMode":"null","slotMode":"null","enqueue":"transitions","initialResolved":"never","directEphemeral":null},
  {"kind":"SCHEDULE_MISSED","keyMode":"scheduled","literalKey":null,"keyPrefix":"missed:","summaries":{"OPEN":"Scheduled {registered-kind} has not succeeded","RESOLVED":"Scheduled {registered-kind} has succeeded"},"durableStates":["OPEN","RESOLVED"],"jobIDMode":"null","slotMode":"key_slot","enqueue":"transitions","initialResolved":"never","directEphemeral":null},
  {"kind":"TERMINAL_WORK_FAILURE","keyMode":"job_uuid","literalKey":null,"keyPrefix":"work:","summaries":{"OPEN":"Work failed and requires attention","RESOLVED":"Work succeeded"},"durableStates":["OPEN","RESOLVED"],"jobIDMode":"key_uuid","slotMode":"null","enqueue":"transitions","initialResolved":"never","directEphemeral":null},
  {"kind":"DB_UNAVAILABLE","keyMode":"literal","literalKey":"database:unavailable","keyPrefix":null,"summaries":{"OPEN":"Database unavailable","RESOLVED":"Database recovered"},"durableStates":["RESOLVED"],"jobIDMode":"null","slotMode":"null","enqueue":"transitions","initialResolved":"observed_db_recovery","directEphemeral":{"state":"OPEN","version":0}},
  {"kind":"ALERT_WEBHOOK_UNCONFIGURED","keyMode":"literal","literalKey":"operator:webhook:configuration","keyPrefix":null,"summaries":{"OPEN":"Operator webhook is not configured","RESOLVED":"Operator webhook is configured"},"durableStates":["OPEN","RESOLVED"],"jobIDMode":"null","slotMode":"null","enqueue":"never","initialResolved":"never","directEphemeral":null},
  {"kind":"OPERATOR_ALERT_DELIVERY_UNHEALTHY","keyMode":"literal","literalKey":"operator:webhook:delivery","keyPrefix":null,"summaries":{"OPEN":"Operator alert delivery is unhealthy","RESOLVED":"Operator alert delivery recovered"},"durableStates":["OPEN","RESOLVED"],"jobIDMode":"null","slotMode":"null","enqueue":"never","initialResolved":"never","directEphemeral":null}
 ]
}`

// AlertConditionSpecification returns a fresh copy of the private program rule.
func AlertConditionSpecification() json.RawMessage {
	return json.RawMessage(alertConditionSpecificationJSON)
}

type alertConditionSpecification struct {
	SchemaVersion           int      `json:"schemaVersion"`
	RegisteredScheduleKinds []string `json:"registeredScheduleKinds"`
	Limits                  struct {
		ClaimedPayloadBytes int   `json:"claimedPayloadBytes"`
		DiscordContentBytes int   `json:"discordContentBytes"`
		CandidateMinVersion int64 `json:"candidateMinVersion"`
		PersistedMinVersion int64 `json:"persistedMinVersion"`
	} `json:"limits"`
	Families []alertConditionFamily `json:"families"`
}
type alertConditionFamily struct {
	Kind            string            `json:"kind"`
	KeyMode         string            `json:"keyMode"`
	LiteralKey      *string           `json:"literalKey"`
	KeyPrefix       *string           `json:"keyPrefix"`
	Summaries       map[string]string `json:"summaries"`
	DurableStates   []string          `json:"durableStates"`
	JobIDMode       string            `json:"jobIDMode"`
	SlotMode        string            `json:"slotMode"`
	Enqueue         string            `json:"enqueue"`
	InitialResolved string            `json:"initialResolved"`
	DirectEphemeral *struct {
		State   string `json:"state"`
		Version int64  `json:"version"`
	} `json:"directEphemeral"`
}

func alertConditionRule() alertConditionSpecification {
	var rule alertConditionSpecification
	if err := json.Unmarshal(AlertConditionSpecification(), &rule); err != nil {
		panic("invalid internal alert specification")
	}
	return rule
}

type alertValidationStage uint8

const (
	alertCandidateStage alertValidationStage = iota
	alertPersistedStage
	alertDirectSendStage
)

type alertConditionMatch struct {
	Family         alertConditionFamily
	RegisteredKind string
	JobID          *string
	Slot           *time.Time
}

func invalidAlert() error { return apierr.New(apierr.Invalid, "INVALID_CONFIGURATION") }

func alertCanonicalUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if s[i] != '-' {
				return false
			}
			continue
		}
		if !(s[i] >= '0' && s[i] <= '9' || s[i] >= 'a' && s[i] <= 'f') {
			return false
		}
	}
	return true
}
func alertASCII(s string) bool {
	for i := range s {
		if s[i] < 32 || s[i] > 126 {
			return false
		}
	}
	return true
}
func alertKeyMatch(rule alertConditionSpecification, family alertConditionFamily, key string) (alertConditionMatch, error) {
	match := alertConditionMatch{Family: family}
	switch family.KeyMode {
	case "literal":
		if family.LiteralKey == nil || key != *family.LiteralKey {
			return match, invalidAlert()
		}
	case "scheduled":
		if family.KeyPrefix == nil || !strings.HasPrefix(key, *family.KeyPrefix) {
			return match, invalidAlert()
		}
		rest := strings.TrimPrefix(key, *family.KeyPrefix)
		kind, slotText, ok := strings.Cut(rest, ":")
		if !ok {
			return match, invalidAlert()
		}
		registered := false
		for _, candidate := range rule.RegisteredScheduleKinds {
			if kind == candidate {
				registered = true
				break
			}
		}
		if !registered {
			return match, invalidAlert()
		}
		slot, err := time.Parse("2006-01-02T15:04:05Z", slotText)
		if err != nil || slot.Format("2006-01-02T15:04:05Z") != slotText {
			return match, invalidAlert()
		}
		match.RegisteredKind, match.Slot = kind, &slot
	case "job_uuid":
		if family.KeyPrefix == nil || !strings.HasPrefix(key, *family.KeyPrefix) {
			return match, invalidAlert()
		}
		id := strings.TrimPrefix(key, *family.KeyPrefix)
		if !alertCanonicalUUID(id) {
			return match, invalidAlert()
		}
		match.JobID = &id
	default:
		return match, invalidAlert()
	}
	return match, nil
}

// Candidates carry expected versions; durable messages carry assigned versions.
func validateAlertTransition(transition AlertTransition, stage alertValidationStage) (alertConditionMatch, error) {
	rule := alertConditionRule()
	for _, family := range rule.Families {
		if family.Kind != transition.Kind {
			continue
		}
		match, err := alertKeyMatch(rule, family, transition.Key)
		if err != nil {
			return match, err
		}
		summary, ok := family.Summaries[transition.State]
		if !ok || transition.SafeSummary != strings.ReplaceAll(summary, "{registered-kind}", match.RegisteredKind) || !alertASCII(transition.Key) || !alertASCII(transition.SafeSummary) {
			return match, invalidAlert()
		}
		if _, err := transition.ObservedAt.MarshalJSON(); err != nil {
			return match, invalidAlert()
		}
		durable := false
		for _, state := range family.DurableStates {
			if state == transition.State {
				durable = true
				break
			}
		}
		switch stage {
		case alertCandidateStage:
			if !durable || transition.Version < rule.Limits.CandidateMinVersion {
				return match, invalidAlert()
			}
		case alertPersistedStage:
			if !durable || transition.Version < rule.Limits.PersistedMinVersion {
				return match, invalidAlert()
			}
		case alertDirectSendStage:
			direct := family.DirectEphemeral
			ephemeral := direct != nil && transition.State == direct.State && transition.Version == direct.Version
			if !ephemeral && (!durable || transition.Version < rule.Limits.PersistedMinVersion) {
				return match, invalidAlert()
			}
		default:
			return match, invalidAlert()
		}
		return match, nil
	}
	return alertConditionMatch{}, invalidAlert()
}
func validateAlertMessage(message AlertMessage, stage alertValidationStage) error {
	match, err := validateAlertTransition(message.Transition, stage)
	if err != nil {
		return err
	}
	switch match.Family.JobIDMode {
	case "null":
		if message.JobID != nil {
			return invalidAlert()
		}
	case "key_uuid":
		if message.JobID == nil || match.JobID == nil || *message.JobID != *match.JobID {
			return invalidAlert()
		}
	default:
		return invalidAlert()
	}
	switch match.Family.SlotMode {
	case "null":
		if message.Slot != nil {
			return invalidAlert()
		}
	case "key_slot":
		if message.Slot == nil || match.Slot == nil || !message.Slot.Equal(*match.Slot) {
			return invalidAlert()
		}
	default:
		return invalidAlert()
	}
	return nil
}
func alertExactObject(raw []byte, fields []string, nullable map[string]bool) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil || len(object) != len(fields) {
		return nil, invalidAlert()
	}
	for _, field := range fields {
		value, ok := object[field]
		if !ok || (!nullable[field] && bytes.Equal(bytes.TrimSpace(value), []byte("null"))) {
			return nil, invalidAlert()
		}
	}
	return object, nil
}
func decodeAlertTransition(raw []byte, stage alertValidationStage) (AlertTransition, error) {
	_, err := alertExactObject(raw, []string{"Key", "Kind", "State", "SafeSummary", "Version", "ObservedAt"}, nil)
	if err != nil {
		return AlertTransition{}, err
	}
	var transition AlertTransition
	if err := json.Unmarshal(raw, &transition); err != nil {
		return transition, invalidAlert()
	}
	_, err = validateAlertTransition(transition, stage)
	return transition, err
}
func decodeAlertMessage(raw []byte) (AlertMessage, error) {
	rule := alertConditionRule()
	if len(raw) > rule.Limits.ClaimedPayloadBytes {
		return AlertMessage{}, invalidAlert()
	}
	object, err := alertExactObject(raw, []string{"Transition", "JobID", "Slot"}, map[string]bool{"JobID": true, "Slot": true})
	if err != nil {
		return AlertMessage{}, err
	}
	transition, err := decodeAlertTransition(object["Transition"], alertPersistedStage)
	if err != nil {
		return AlertMessage{}, err
	}
	var message AlertMessage
	if err := json.Unmarshal(raw, &message); err != nil {
		return message, invalidAlert()
	}
	message.Transition = transition
	return message, validateAlertMessage(message, alertPersistedStage)
}

type webhookFailure struct {
	code      string
	permanent bool
	after     time.Duration
}

func (failure *webhookFailure) Error() string { return failure.code }
func (failure *webhookFailure) Unwrap() error {
	code := apierr.Internal
	if failure.permanent {
		code = apierr.Invalid
	}
	return apierr.New(code, failure.code)
}
func webhookConfigurationFailure() error {
	return &webhookFailure{code: "INVALID_CONFIGURATION", permanent: true}
}

// DiscordWebhook owns provider adaptation, not transactions or delivery state.
type DiscordWebhook struct {
	endpoint string
	client   *http.Client
}

var _ WebhookSender = (*DiscordWebhook)(nil)

func NewDiscordWebhook(endpoint string, client *http.Client) (*DiscordWebhook, error) {
	if client == nil {
		return nil, webhookConfigurationFailure()
	}
	clone := *client
	clone.Timeout = 5 * time.Second
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	webhook := &DiscordWebhook{client: &clone}
	if endpoint == "" {
		return webhook, nil
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || !strings.EqualFold(parsed.Hostname(), "discord.com") || parsed.User != nil || parsed.Fragment != "" || parsed.Opaque != "" || strings.Contains(parsed.EscapedPath(), "%") || strings.Contains(endpoint, "#") {
		return nil, webhookConfigurationFailure()
	}
	if parsed.Port() != "" && parsed.Port() != "443" {
		return nil, webhookConfigurationFailure()
	}
	// An empty explicit port is not the admitted absent-port authority.
	host := strings.ToLower(parsed.Host)
	if host != "discord.com" && host != "discord.com:443" {
		return nil, webhookConfigurationFailure()
	}
	segments := strings.Split(parsed.Path, "/")
	var id, token string
	switch {
	case len(segments) == 5 && segments[0] == "" && segments[1] == "api" && segments[2] == "webhooks":
		id, token = segments[3], segments[4]
	case len(segments) == 6 && segments[0] == "" && segments[1] == "api" && segments[2] == "v10" && segments[3] == "webhooks":
		id, token = segments[4], segments[5]
	default:
		return nil, webhookConfigurationFailure()
	}
	for i := range id {
		if id[i] < '0' || id[i] > '9' {
			return nil, webhookConfigurationFailure()
		}
	}
	number, err := strconv.ParseUint(id, 10, 64)
	if err != nil || number == 0 || token == "" || token == "." || token == ".." {
		return nil, webhookConfigurationFailure()
	}
	for i := range token {
		c := token[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.ContainsRune("._~-", rune(c))) {
			return nil, webhookConfigurationFailure()
		}
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil || len(query) > 1 {
		return nil, webhookConfigurationFailure()
	}
	if len(query) == 1 {
		values, ok := query["wait"]
		if !ok || len(values) != 1 || values[0] != "true" {
			return nil, webhookConfigurationFailure()
		}
	}
	parsed.RawQuery = "wait=true"
	parsed.ForceQuery = false
	webhook.endpoint = parsed.String()
	return webhook, nil
}
func (webhook *DiscordWebhook) Configured() bool { return webhook != nil && webhook.endpoint != "" }

func webhookContent(message AlertMessage) (string, error) {
	transition := message.Transition
	observed, err := transition.ObservedAt.UTC().MarshalText()
	if err != nil {
		return "", webhookConfigurationFailure()
	}
	content := transition.SafeSummary + "\nKey: " + transition.Key + "\nKind: " + transition.Kind + "\nState: " + transition.State + "\nVersion: " + strconv.FormatInt(transition.Version, 10) + "\nObservedAt: " + string(observed)
	if message.JobID != nil {
		content += "\nJobID: " + *message.JobID
	}
	if message.Slot != nil {
		slot, err := message.Slot.UTC().MarshalText()
		if err != nil {
			return "", webhookConfigurationFailure()
		}
		content += "\nSlot: " + string(slot)
	}
	if len(content) > alertConditionRule().Limits.DiscordContentBytes {
		return "", webhookConfigurationFailure()
	}
	return content, nil
}
func webhookRetryHint(text string) time.Duration {
	seconds, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		return 0
	}
	if seconds == 0 {
		precise, ok := new(big.Float).SetString(strings.TrimSpace(text))
		if ok && precise.Sign() > 0 {
			return time.Nanosecond
		}
		return 0
	}
	seconds = min(seconds, 300)
	return time.Duration(math.Ceil(seconds * float64(time.Second)))
}
func webhookBodyRetryHint(body []byte) time.Duration {
	var hint struct {
		RetryAfter json.RawMessage `json:"retry_after"`
	}
	if json.Unmarshal(body, &hint) != nil {
		return 0
	}
	var number any
	decoder := json.NewDecoder(bytes.NewReader(hint.RetryAfter))
	decoder.UseNumber()
	if decoder.Decode(&number) != nil {
		return 0
	}
	value, ok := number.(json.Number)
	if !ok {
		return 0
	}
	return webhookRetryHint(string(value))
}
func (webhook *DiscordWebhook) Send(ctx context.Context, message AlertMessage) error {
	if err := validateAlertMessage(message, alertDirectSendStage); err != nil {
		return webhookConfigurationFailure()
	}
	if !webhook.Configured() {
		return &webhookFailure{code: "ALERT_WEBHOOK_UNCONFIGURED", permanent: true}
	}
	content, err := webhookContent(message)
	if err != nil {
		return err
	}
	body, err := json.Marshal(struct {
		Content         string `json:"content"`
		AllowedMentions struct {
			Parse []string `json:"parse"`
		} `json:"allowed_mentions"`
	}{Content: content, AllowedMentions: struct {
		Parse []string `json:"parse"`
	}{Parse: []string{}}})
	if err != nil {
		return webhookConfigurationFailure()
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook.endpoint, bytes.NewReader(body))
	if err != nil {
		return webhookConfigurationFailure()
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := webhook.client.Do(request)
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return &webhookFailure{code: "OPERATOR_ALERT_DELIVERY_FAILED"}
	}
	if response == nil || response.Body == nil {
		return &webhookFailure{code: "OPERATOR_ALERT_DELIVERY_FAILED"}
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(io.LimitReader(response.Body, (64<<10)+1))
	if readErr != nil || len(raw) > 64<<10 {
		raw = nil
	}
	switch {
	case response.StatusCode >= 200 && response.StatusCode < 300:
		return nil
	case response.StatusCode == http.StatusTooManyRequests:
		delay := webhookRetryHint(response.Header.Get("Retry-After"))
		if delay == 0 {
			delay = webhookBodyRetryHint(raw)
		}
		return &webhookFailure{code: "OPERATOR_ALERT_RATE_LIMITED", after: delay}
	case response.StatusCode >= 300 && response.StatusCode < 500:
		return webhookConfigurationFailure()
	default:
		return &webhookFailure{code: "OPERATOR_ALERT_DELIVERY_FAILED"}
	}
}
func safeOperatorStoreError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) {
		return context.Canceled
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return context.DeadlineExceeded
	}
	if expected, ok := errors.AsType[*apierr.Error](err); ok {
		return apierr.New(expected.Code, "OPERATOR_ALERT_STORE_FAILED")
	}
	return apierr.New(apierr.Internal, "OPERATOR_ALERT_STORE_FAILED")
}
func (webhook *DiscordWebhook) ProcessOne(ctx context.Context, store jobs.Store) (bool, error) {
	if store == nil || (reflect.ValueOf(store).Kind() == reflect.Pointer && reflect.ValueOf(store).IsNil()) {
		return false, apierr.New(apierr.Invalid, "INVALID_CONFIGURATION")
	}
	job, err := store.ClaimOne(ctx, "operator_alert")
	if err != nil {
		return false, safeOperatorStoreError(err)
	}
	if job.ID == "" {
		return false, nil
	}
	receipt := job.Receipt()
	if job.Kind != "operator_alert" || job.Lane != "operator_alert" {
		return true, safeOperatorStoreError(store.Fail(ctx, receipt, jobs.RepairRequired, "INVALID_CONFIGURATION"))
	}
	message, err := decodeAlertMessage(job.Payload)
	if err != nil {
		return true, safeOperatorStoreError(store.Fail(ctx, receipt, jobs.RepairRequired, "INVALID_CONFIGURATION"))
	}
	err = jobs.RunLeased(ctx, store, job, func(work context.Context) error { return webhook.Send(work, message) })
	if err == nil {
		return true, safeOperatorStoreError(store.Succeed(ctx, receipt))
	}
	if ctx.Err() != nil {
		return true, ctx.Err()
	}
	failure, ok := errors.AsType[*webhookFailure](err)
	if !ok {
		return true, safeOperatorStoreError(err)
	}
	if failure.permanent {
		return true, safeOperatorStoreError(store.Fail(ctx, receipt, jobs.RepairRequired, failure.code))
	}
	if job.Attempts >= jobs.MaxAttempts {
		return true, safeOperatorStoreError(store.Fail(ctx, receipt, jobs.Dead, failure.code))
	}
	return true, safeOperatorStoreError(store.Retry(ctx, receipt, failure.after, failure.code))
}

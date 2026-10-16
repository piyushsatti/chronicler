package observations_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/observations"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

var (
	_ func(observations.WorkerHeartbeatWriter, context.Context) (bool, error)                          = observations.WorkerHeartbeatWriter.RecordWorkerHeartbeat
	_ func(observations.ObservationStore, context.Context) (observations.WorkerHeartbeatStatus, error) = observations.ObservationStore.ReadWorkerHeartbeat
	_ func(observations.ObservationStore, context.Context, []string) (map[string]int64, error)         = observations.ObservationStore.ReadCurrentConditionVersions
	_ func(observations.WebhookSender) bool                                                            = observations.WebhookSender.Configured
)

func TestPhase3TaskOB01Acceptance(t *testing.T) {
	t.Run("published model fields", func(t *testing.T) {
		assertFields(t, reflect.TypeFor[observations.ScheduledStatus](), map[string]reflect.Type{
			"Kind": reflect.TypeFor[string](), "ExpectedSlot": reflect.TypeFor[time.Time](),
			"Outcome": reflect.TypeFor[string](), "LastStartedAt": reflect.TypeFor[*time.Time](),
			"LastFinishedAt": reflect.TypeFor[*time.Time](), "JobID": reflect.TypeFor[*string](),
			"SafeErrorCode": reflect.TypeFor[*string](),
		})
		assertFields(t, reflect.TypeFor[observations.AlertTransition](), map[string]reflect.Type{
			"Key": reflect.TypeFor[string](), "Kind": reflect.TypeFor[string](),
			"State": reflect.TypeFor[string](), "SafeSummary": reflect.TypeFor[string](),
			"Version": reflect.TypeFor[int64](), "ObservedAt": reflect.TypeFor[time.Time](),
		})
		assertFields(t, reflect.TypeFor[observations.ScheduleSpec](), map[string]reflect.Type{
			"Kind": reflect.TypeFor[string](), "HourUTC": reflect.TypeFor[int32](),
			"MinuteUTC": reflect.TypeFor[int32](), "DeadlineMinutes": reflect.TypeFor[int32](),
		})
		assertFields(t, reflect.TypeFor[observations.ScheduleRegistry](), map[string]reflect.Type{
			"Entries": reflect.TypeFor[[]observations.ScheduleSpec](),
		})
		assertFields(t, reflect.TypeFor[observations.AlertMessage](), map[string]reflect.Type{
			"Transition": reflect.TypeFor[observations.AlertTransition](),
			"JobID":      reflect.TypeFor[*string](), "Slot": reflect.TypeFor[*time.Time](),
		})
		assertFields(t, reflect.TypeFor[observations.WorkerHeartbeatStatus](), map[string]reflect.Type{
			"CheckedAt": reflect.TypeFor[time.Time](), "LastObservedAt": reflect.TypeFor[*time.Time](),
		})
	})
	t.Run("repository and adapter methods", func(t *testing.T) {
		assertMethods(t, reflect.TypeFor[observations.ObservationStore](), map[string]reflect.Type{
			"RecordLifecycle":              reflect.TypeFor[func(context.Context, jobs.SQLExecutor, jobs.LifecycleFact) error](),
			"ListScheduled":                reflect.TypeFor[func(context.Context, auth.Authority, product.Page) ([]observations.ScheduledStatus, error)](),
			"EvaluateOverdue":              reflect.TypeFor[func(context.Context, time.Time, []observations.ScheduleSpec) ([]observations.AlertTransition, error)](),
			"PersistTransition":            reflect.TypeFor[func(context.Context, jobs.SQLExecutor, observations.AlertTransition) error](),
			"CurrentTransition":            reflect.TypeFor[func(context.Context, jobs.SQLExecutor, string) (*observations.AlertTransition, error)](),
			"ReadWorkerHeartbeat":          reflect.TypeFor[func(context.Context) (observations.WorkerHeartbeatStatus, error)](),
			"ReadCurrentConditionVersions": reflect.TypeFor[func(context.Context, []string) (map[string]int64, error)](),
		})
		assertMethods(t, reflect.TypeFor[observations.WorkerHeartbeatWriter](), map[string]reflect.Type{
			"RecordWorkerHeartbeat": reflect.TypeFor[func(context.Context) (bool, error)](),
		})
		assertMethods(t, reflect.TypeFor[observations.TransitionWriter](), map[string]reflect.Type{
			"ApplyTransitions": reflect.TypeFor[func(context.Context, []observations.AlertTransition) error](),
		})
		assertMethods(t, reflect.TypeFor[observations.WebhookSender](), map[string]reflect.Type{
			"Send":       reflect.TypeFor[func(context.Context, observations.AlertMessage) error](),
			"Configured": reflect.TypeFor[func() bool](),
		})
		assertMethods(t, reflect.TypeFor[observations.DBOutageMonitor](), map[string]reflect.Type{
			"ShouldSend":   reflect.TypeFor[func(time.Time) bool](),
			"MarkAccepted": reflect.TypeFor[func(time.Time)](), "Reset": reflect.TypeFor[func()](),
		})
	})
}

func assertFields(t *testing.T, got reflect.Type, want map[string]reflect.Type) {
	t.Helper()
	if got.NumField() != len(want) {
		t.Fatalf("%s has %d fields, want %d", got, got.NumField(), len(want))
	}
	for name, expected := range want {
		field, ok := got.FieldByName(name)
		if !ok || !field.IsExported() || field.Type != expected {
			t.Errorf("%s.%s has type %v, want exported %v", got, name, field.Type, expected)
		}
	}
}

func assertMethods(t *testing.T, got reflect.Type, want map[string]reflect.Type) {
	t.Helper()
	if got.NumMethod() != len(want) {
		t.Fatalf("%s has %d methods, want %d", got, got.NumMethod(), len(want))
	}
	for name, expected := range want {
		method, ok := got.MethodByName(name)
		if !ok || method.Type != expected {
			t.Errorf("%s.%s has signature %v, want %v", got, name, method.Type, expected)
		}
	}
}

package jobs

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRunLeasedCancelsAndAwaitsWork(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	job := Job{Kind: "test", AttemptDeadlineAt: time.Now().Add(time.Minute)}
	started := make(chan struct{})
	observed := make(chan struct{})
	release := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		result <- RunLeased(ctx, &MemoryStore{}, job, func(ctx context.Context) error {
			close(started)
			<-ctx.Done()
			close(observed)
			<-release
			return ctx.Err()
		})
	}()
	<-started
	cancel()
	<-observed
	select {
	case <-result:
		t.Fatal("returned before cancelled work joined")
	default:
	}
	close(release)
	select {
	case e := <-result:
		if !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	case <-time.After(time.Second):
		t.Fatal("did not join")
	}
}
func TestNormalizedPayloadNeverCollapsesLargeIntegers(t *testing.T) {
	if EqualJSON([]byte(`{"id":9007199254740992}`), []byte(`{"id":9007199254740993}`)) {
		t.Fatal("distinct result metadata acknowledged as same")
	}
}

func TestNormalizedPayloadMatchesJSONBNumericValues(t *testing.T) {
	for _, tc := range []struct {
		name, a, b string
		equal      bool
	}{
		{"exponent", `{"n":1e3}`, `{"n":1000}`, true},
		{"small exponent", `{"n":1e-5}`, `{"n":0.00001}`, true},
		{"negative zero", `{"n":-0.0}`, `{"n":0.0}`, true},
		{"nested numbers", `{"sources":[{"n":1.20e+2}],"d":{"n":9007199254740993}}`, `{"d":{"n":9007199254740993.0},"sources":[{"n":120}]}`, true},
		{"large changed integer", `{"n":9007199254740992}`, `{"n":9007199254740993}`, false},
		{"changed fractional precision", `{"n":1.0000000000000000001}`, `{"n":1.0000000000000000002}`, false},
		{"number versus string", `{"n":1}`, `{"n":"1"}`, false},
		{"huge exponent without expansion", `{"n":1e10000000000000000000}`, `{"n":10e9999999999999999999}`, true},
		{"array order", `[1,2]`, `[2,1]`, false},
		{"null versus missing", `{"n":null}`, `{}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := EqualJSON([]byte(tc.a), []byte(tc.b)); got != tc.equal {
				t.Fatalf("EqualJSON(%s,%s)=%v want%v", tc.a, tc.b, got, tc.equal)
			}
		})
	}
}

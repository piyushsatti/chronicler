package graph

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestRequestLoadersClearEveryRegisteredCache(t *testing.T) {
	registry := &RequestLoaders{}
	value := reflect.ValueOf(registry).Elem()
	cleared := make([]int, value.NumField())
	for i := 0; i < value.NumField(); i++ {
		loader := reflect.New(value.Field(i).Type().Elem())
		loader.Elem().FieldByName("Clear").Set(reflect.ValueOf(func() { cleared[i]++ }))
		value.Field(i).Set(loader)
	}
	registry.clear()
	for i, n := range cleared {
		if n != 1 {
			t.Errorf("%s cleared %d times", value.Type().Field(i).Name, n)
		}
	}
	(&RequestLoaders{}).clear()
	(*RequestLoaders)(nil).clear()
}

func TestArcBatchLoaderPreservesInputOrder(t *testing.T) {
	admin, err := auth.NewAuthority("ada", []auth.Role{auth.Admin}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	state, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
		return admin, nil
	}, &admin)
	if err != nil {
		t.Fatal(err)
	}
	loader := newKeyedLoader(state, func(ctx context.Context, actor auth.Authority, keys []quest.IDKey) ([]product.BatchResult[quest.QuestArcView], error) {
		out := make([]product.BatchResult[quest.QuestArcView], len(keys))
		for i, key := range keys {
			out[i] = product.BatchResult[quest.QuestArcView]{Value: &quest.QuestArcView{Id: key.ID, Name: "arc-" + key.ID}}
		}
		return out, nil
	})
	keys := []quest.IDKey{
		{ID: "10000000-0000-4000-8000-00000000000a"},
		{ID: "10000000-0000-4000-8000-00000000000b"},
		{ID: "10000000-0000-4000-8000-00000000000a"},
		{ID: "10000000-0000-4000-8000-00000000000c"},
	}
	results, err := loader.LoadMany(context.Background(), keys)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != len(keys) {
		t.Fatalf("len=%d", len(results))
	}
	for i, key := range keys {
		if results[i].Value == nil || results[i].Value.Id != key.ID {
			t.Fatalf("slot %d = %+v, want %s", i, results[i], key.ID)
		}
	}
}

func TestNewLoaderRegistryChunksAndCaches(t *testing.T) {
	admin, err := auth.NewAuthority("ada", []auth.Role{auth.Admin}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	var batches atomicInt
	state, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
		return admin, nil
	}, &admin)
	if err != nil {
		t.Fatal(err)
	}
	loader := newKeyedLoader(state, func(ctx context.Context, actor auth.Authority, keys []member.IDKey) ([]product.BatchResult[member.MemberView], error) {
		batches.add(1)
		if len(keys) > loaderChunkSize {
			t.Errorf("batch has %d keys, max %d", len(keys), loaderChunkSize)
		}
		out := make([]product.BatchResult[member.MemberView], len(keys))
		for i := range keys {
			out[i] = product.BatchResult[member.MemberView]{Value: &member.MemberView{Id: keys[i].ID}}
		}
		return out, nil
	})
	keys := make([]member.IDKey, 150)
	for i := range keys {
		keys[i] = member.IDKey{ID: "10000000-0000-4000-8000-" + format4(i)}
	}
	if _, err := loader.LoadMany(context.Background(), keys); err != nil {
		t.Fatal(err)
	}
	if batches.load() != 2 {
		t.Fatalf("expected 2 chunks, got %d", batches.load())
	}
	if _, err := loader.LoadMany(context.Background(), keys[:1]); err != nil {
		t.Fatal(err)
	}
	if batches.load() != 2 {
		t.Fatalf("cache miss count = %d", batches.load())
	}
}

type atomicInt struct {
	n atomic.Int64
}

func (a *atomicInt) add(v int) { a.n.Add(int64(v)) }
func (a *atomicInt) load() int { return int(a.n.Load()) }

func format4(v int) string {
	const digits = "0123456789abcdef"
	b := []byte("000000000000")
	for i := len(b) - 1; i >= 0; i-- {
		b[i] = digits[v&0xf]
		v >>= 4
	}
	return string(b)
}

func loaderTestState(t *testing.T) *RequestState {
	t.Helper()
	actor := requestTestAuthority(t, "ada", auth.Admin)
	state, err := NewRequestState(auth.Claims{MemberID: "ada"}, func(context.Context, string) (auth.Authority, error) {
		return actor, nil
	}, &actor)
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestLoaderCoalescesConcurrentKeys(t *testing.T) {
	var calls atomic.Int32
	loader := newKeyedLoader(loaderTestState(t), func(_ context.Context, _ auth.Authority, keys []int) ([]product.BatchResult[int], error) {
		calls.Add(1)
		out := make([]product.BatchResult[int], len(keys))
		for i, key := range keys {
			out[i].Value = &key
		}
		return out, nil
	})
	start := make(chan struct{})
	var wg sync.WaitGroup
	for key := range 16 {
		wg.Go(func() {
			<-start
			got, err := loader.Load(context.Background(), key)
			if err != nil || got == nil || *got != key {
				t.Errorf("key %d: value=%v error=%v", key, got, err)
			}
		})
	}
	close(start)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("concurrent loads made %d batch reads, want 1", calls.Load())
	}
}

func TestLoaderDeduplicatesInflightKeys(t *testing.T) {
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	loader := newKeyedLoader(loaderTestState(t), func(_ context.Context, _ auth.Authority, keys []int) ([]product.BatchResult[int], error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		out := make([]product.BatchResult[int], len(keys))
		for i, key := range keys {
			out[i].Value = &key
		}
		return out, nil
	})
	var wg sync.WaitGroup
	wg.Go(func() {
		if _, err := loader.Load(context.Background(), 7); err != nil {
			t.Error(err)
		}
	})
	<-started
	for range 8 {
		wg.Go(func() {
			if got, err := loader.Load(context.Background(), 7); err != nil || got == nil || *got != 7 {
				t.Errorf("value=%v error=%v", got, err)
			}
		})
	}
	time.Sleep(10 * time.Millisecond)
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("identical in-flight keys made %d reads, want 1", calls.Load())
	}
}

func TestLoaderClearPreventsOldGenerationCachePublication(t *testing.T) {
	state := loaderTestState(t)
	player := requestTestAuthority(t, "ada", auth.Player)
	state.Resolver = func(context.Context, string) (auth.Authority, error) { return player, nil }
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	loader := newKeyedLoader(state, func(_ context.Context, actor auth.Authority, keys []member.IDKey) ([]product.BatchResult[member.MemberView], error) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		out := make([]product.BatchResult[member.MemberView], len(keys))
		for i := range keys {
			name := "fresh"
			if actor.Claims().Has(auth.Admin) {
				name = "stale"
			}
			out[i].Value = &member.MemberView{Id: name}
		}
		return out, nil
	})
	if err := state.InstallLoaders(&RequestLoaders{Members: loader}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	oldDone := make(chan error, 1)
	go func() { _, err := loader.Load(ctx, member.IDKey{ID: "member"}); oldDone <- err }()
	<-started
	state.ClearLoaders()
	state.InvalidateAuthority()
	got, err := loader.Load(ctx, member.IDKey{ID: "member"})
	if err != nil || got == nil || got.Id != "fresh" {
		t.Fatalf("new generation value=%v error=%v", got, err)
	}
	close(release)
	if err := <-oldDone; err != nil {
		t.Fatal(err)
	}
	got, err = loader.Load(ctx, member.IDKey{ID: "member"})
	if err != nil || got == nil || got.Id != "fresh" {
		t.Fatalf("late old read replaced fresh value: value=%v error=%v", got, err)
	}
	if calls.Load() != 2 {
		t.Fatalf("reads=%d, want 2", calls.Load())
	}
}

func TestLoaderCancellationAndBatchFailureReleaseWaiters(t *testing.T) {
	for _, failure := range []string{"cancel", "read", "length"} {
		t.Run(failure, func(t *testing.T) {
			started, release := make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			batchErr := errors.New("batch failed")
			loader := newKeyedLoader(loaderTestState(t), func(ctx context.Context, _ auth.Authority, keys []int) ([]product.BatchResult[int], error) {
				if calls.Add(1) == 1 {
					close(started)
					if failure == "cancel" {
						<-ctx.Done()
						return nil, ctx.Err()
					}
					<-release
					if failure == "read" {
						return nil, batchErr
					}
					return nil, nil
				}
				out := make([]product.BatchResult[int], len(keys))
				for i, key := range keys {
					out[i].Value = &key
				}
				return out, nil
			})
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			waitCtx, stop := context.WithCancel(ctx)
			defer stop()
			done := make(chan error, 9)
			go func() { _, err := loader.LoadMany(waitCtx, []int{1, 2, 1}); done <- err }()
			<-started
			for key := range 8 {
				go func() { _, err := loader.Load(ctx, key%2+1); done <- err }()
			}
			time.Sleep(10 * time.Millisecond)
			if failure == "cancel" {
				stop()
			} else {
				close(release)
			}
			for range 9 {
				select {
				case err := <-done:
					if err == nil || (failure == "cancel" && !errors.Is(err, context.Canceled)) || (failure == "read" && !errors.Is(err, batchErr)) {
						t.Fatalf("failure=%s error=%v", failure, err)
					}
				case <-ctx.Done():
					t.Fatal("batch failure stranded a waiter")
				}
			}
			if got, err := loader.LoadMany(ctx, []int{2, 1, 2}); err != nil || len(got) != 3 || got[0].Value == nil || *got[0].Value != 2 || got[1].Value == nil || *got[1].Value != 1 || got[2].Value == nil || *got[2].Value != 2 {
				t.Fatalf("retry value=%v error=%v", got, err)
			}
		})
	}
}

func TestLoaderPreservesPerKeyErrorsAndNullableValues(t *testing.T) {
	forbidden := errors.New("forbidden key")
	var calls atomic.Int32
	loader := newKeyedLoader(loaderTestState(t), func(_ context.Context, _ auth.Authority, keys []int) ([]product.BatchResult[int], error) {
		calls.Add(1)
		out := make([]product.BatchResult[int], len(keys))
		for i, key := range keys {
			switch key {
			case 1:
				out[i].Err = forbidden
			case 2:
				out[i].Value = &key
			}
		}
		return out, nil
	})
	got, err := loader.LoadMany(context.Background(), []int{2, 1, 3, 2})
	if err != nil || len(got) != 4 || got[0].Value == nil || *got[0].Value != 2 || !errors.Is(got[1].Err, forbidden) || got[2].Value != nil || got[2].Err != nil || got[3].Value == nil || *got[3].Value != 2 {
		t.Fatalf("positional results=%v error=%v", got, err)
	}
	if value, err := loader.Load(context.Background(), 1); value != nil || !errors.Is(err, forbidden) {
		t.Fatalf("cached per-key error value=%v error=%v", value, err)
	}
	if value, err := loader.Load(context.Background(), 3); value != nil || err != nil {
		t.Fatalf("cached nullable value=%v error=%v", value, err)
	}
	if calls.Load() != 1 {
		t.Fatalf("cached results made %d reads, want 1", calls.Load())
	}
}

func TestLoaderReaderPanicFailsWaitersWithoutCrashing(t *testing.T) {
	var calls atomic.Int32
	loader := newKeyedLoader(loaderTestState(t), func(_ context.Context, _ auth.Authority, keys []int) ([]product.BatchResult[int], error) {
		if calls.Add(1) == 1 {
			panic("mapper bug")
		}
		out := make([]product.BatchResult[int], len(keys))
		for i, key := range keys {
			out[i].Value = &key
		}
		return out, nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := loader.Load(ctx, 7); err == nil || ctx.Err() != nil {
		t.Fatalf("panicking read: err=%v ctx=%v, want a loader error before the deadline", err, ctx.Err())
	}
	// The failed key is not cached, so the next load retries the reader.
	if value, err := loader.Load(ctx, 7); err != nil || value == nil || *value != 7 {
		t.Fatalf("retry after panic: value=%v err=%v", value, err)
	}
}

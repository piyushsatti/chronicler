package graph

import (
	"context"
	"reflect"
	"testing"

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
		_ = len(keys)
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
	n int
}

func (a *atomicInt) add(v int) { a.n += v }
func (a *atomicInt) load() int { return a.n }

func format4(v int) string {
	const digits = "0123456789abcdef"
	b := []byte("000000000000")
	for i := len(b) - 1; i >= 0; i-- {
		b[i] = digits[v&0xf]
		v >>= 4
	}
	return string(b)
}

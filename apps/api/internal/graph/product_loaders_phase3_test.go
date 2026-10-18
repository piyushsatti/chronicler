package graph

import (
	"reflect"
	"testing"
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

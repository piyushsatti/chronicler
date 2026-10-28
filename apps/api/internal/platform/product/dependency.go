package product

import "reflect"

// MissingDependency reports a nil interface or a typed nil of a nil-capable
// kind; a plain `== nil` check misses a nil pointer stored in an interface.
func MissingDependency(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return v.IsNil()
	default:
		return false
	}
}

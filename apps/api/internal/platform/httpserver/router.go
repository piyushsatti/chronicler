package httpserver

import "net/http"

// Router is the subset of http.ServeMux used by slice Routes helpers.
// Tests may substitute a RecordingMux to capture registered patterns.
type Router interface {
	Handle(pattern string, handler http.Handler)
	HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request))
}

// RecordingMux wraps ServeMux and records every registered pattern.
type RecordingMux struct {
	*http.ServeMux
	Patterns []string
}

func NewRecordingMux() *RecordingMux {
	return &RecordingMux{ServeMux: http.NewServeMux()}
}

func (m *RecordingMux) Handle(pattern string, handler http.Handler) {
	m.Patterns = append(m.Patterns, pattern)
	m.ServeMux.Handle(pattern, handler)
}

func (m *RecordingMux) HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request)) {
	m.Patterns = append(m.Patterns, pattern)
	m.ServeMux.HandleFunc(pattern, handler)
}

// Announce records a contract-facing pattern without registering it on the mux.
// Used when several logical OpenAPI paths share one ServeMux handler (overlapping wildcards).
func (m *RecordingMux) Announce(pattern string) {
	m.Patterns = append(m.Patterns, pattern)
}

// HandleFuncUntracked registers a handler without adding to Patterns.
func (m *RecordingMux) HandleFuncUntracked(pattern string, handler func(http.ResponseWriter, *http.Request)) {
	m.ServeMux.HandleFunc(pattern, handler)
}

// Announce records pattern on RecordingMux; no-op for plain routers.
func Announce(mux Router, pattern string) {
	if a, ok := mux.(interface{ Announce(string) }); ok {
		a.Announce(pattern)
	}
}

// HandleFuncUntracked registers pattern without recording it for contract drift.
func HandleFuncUntracked(mux Router, pattern string, handler func(http.ResponseWriter, *http.Request)) {
	if u, ok := mux.(interface {
		HandleFuncUntracked(string, func(http.ResponseWriter, *http.Request))
	}); ok {
		u.HandleFuncUntracked(pattern, handler)
		return
	}
	mux.HandleFunc(pattern, handler)
}

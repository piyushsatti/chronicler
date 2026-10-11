package httpserver

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

// CORS wraps the next handler so rate-limit and app errors still get ACAO headers.
func CORS(origins []string, next http.Handler) http.Handler {
	allowed := map[string]struct{}{}
	for _, o := range origins {
		allowed[o] = struct{}{}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if _, ok := allowed[origin]; ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Ingest-Secret")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Recover turns panics into opaque 500s.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.ErrorContext(r.Context(), "panic", "path", r.URL.Path, "panic", v, "stack", string(debug.Stack()))
				apierr.Write(w, r, apierr.New(apierr.Internal, "internal error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// RequestLog logs method, path, status, and duration.
func RequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.InfoContext(r.Context(), "request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"ms", time.Since(start).Milliseconds(),
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// RateLimit is a minimal in-memory limiter for selected paths.
// CORS must wrap this so 429 responses still carry ACAO.
type RateLimit struct {
	window time.Duration
	limit  int
	paths  map[string]struct{}
	hits   map[string][]time.Time
}

func NewRateLimit(window time.Duration, limit int, paths ...string) *RateLimit {
	m := make(map[string]struct{}, len(paths))
	for _, p := range paths {
		m[p] = struct{}{}
	}
	return &RateLimit{window: window, limit: limit, paths: m, hits: map[string][]time.Time{}}
}

func (rl *RateLimit) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := rl.paths[r.URL.Path]; !ok {
			next.ServeHTTP(w, r)
			return
		}
		key := r.Header.Get("Authorization")
		if key == "" {
			key = r.RemoteAddr
		}
		now := time.Now()
		cutoff := now.Add(-rl.window)
		kept := rl.hits[key][:0]
		for _, t := range rl.hits[key] {
			if t.After(cutoff) {
				kept = append(kept, t)
			}
		}
		if len(kept) >= rl.limit {
			apierr.Write(w, r, apierr.New(apierr.Conflict, "rate limit exceeded"))
			return
		}
		rl.hits[key] = append(kept, now)
		next.ServeHTTP(w, r)
	})
}

// Chain applies middleware in request order: first listed is outermost.
func Chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// MaxBody rejects bodies larger than n bytes for matching path prefixes.
func MaxBody(n int64, prefixes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, p := range prefixes {
				if strings.HasPrefix(r.URL.Path, p) {
					r.Body = http.MaxBytesReader(w, r.Body, n)
					break
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

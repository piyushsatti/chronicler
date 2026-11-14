// Package apierr is the one vocabulary for expected failures.
//
// An expected failure is a value of type *Error and maps to a typed code on
// the wire. Any other error is a bug and becomes an opaque 500.
package apierr

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

type Code string

const (
	Invalid         Code = "INVALID"
	Unauthenticated Code = "UNAUTHENTICATED"
	Forbidden       Code = "FORBIDDEN"
	NotFound        Code = "NOT_FOUND"
	Conflict        Code = "CONFLICT"
	Internal        Code = "INTERNAL"
)

var statusByCode = map[Code]int{
	Invalid:         http.StatusUnprocessableEntity,
	Unauthenticated: http.StatusUnauthorized,
	Forbidden:       http.StatusForbidden,
	NotFound:        http.StatusNotFound,
	Conflict:        http.StatusConflict,
	Internal:        http.StatusInternalServerError,
}

type Error struct {
	Code    Code
	Message string
	Cause   error
}

func New(code Code, message string) *Error {
	return &Error{Code: code, Message: message}
}

func Wrap(code Code, message string, cause error) *Error {
	return &Error{Code: code, Message: message, Cause: cause}
}

func (e *Error) Error() string {
	if e.Cause == nil {
		return string(e.Code) + ": " + e.Message
	}
	return string(e.Code) + ": " + e.Message + ": " + e.Cause.Error()
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

type problem struct {
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   Code   `json:"code"`
}

// Write renders err as application/problem+json.
func Write(w http.ResponseWriter, r *http.Request, err error) {
	body := problem{Title: "Internal error", Status: http.StatusInternalServerError, Code: "INTERNAL"}
	if expected, ok := errors.AsType[*Error](err); ok {
		body = problem{Title: expected.Message, Status: statusByCode[expected.Code], Code: expected.Code}
		if expected.Cause != nil || expected.Code == Internal {
			slog.ErrorContext(r.Context(), "unexpected error", "path", r.URL.Path, "error", err)
		}
	} else {
		slog.ErrorContext(r.Context(), "unexpected error", "path", r.URL.Path, "error", err)
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(body.Status)
	_ = json.NewEncoder(w).Encode(body)
}

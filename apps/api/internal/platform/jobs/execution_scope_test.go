package jobs_test

import (
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestExecutionScopePreservesReceiptAndBorrowedConnection(t *testing.T) {
	receipt := jobs.Receipt{ID: "job-7", Token: "19"}
	conn := new(pgxpool.Conn)
	scope := jobs.ExecutionScope{Receipt: receipt, Connection: conn}
	shape := reflect.TypeOf(scope)
	if shape.NumField() != 2 || shape.Field(0).Name != "Receipt" || shape.Field(0).Type != reflect.TypeOf(receipt) || shape.Field(1).Name != "Connection" || shape.Field(1).Type != reflect.TypeOf(conn) {
		t.Fatalf("unexpected execution scope shape: %v", shape)
	}
	if scope.Receipt != receipt || scope.Connection != conn {
		t.Fatal("borrowed scope lost its exact receipt or connection")
	}
}

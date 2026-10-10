package contract_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func contractsDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// apps/api/test/contract → …/chronicler → packages/contracts
	dir := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "packages", "contracts"))
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		t.Fatalf("packages/contracts not found at %s: %v", dir, err)
	}
	return dir
}

package config

import (
	"os/exec"
	"path/filepath"
	"testing"
)

func TestProductionRunnerHookAdmitsOnlyReleaseTags(t *testing.T) {
	hook := filepath.Join("..", "..", "..", "..", "..", "deploy", "runner", "production-job-started.sh")
	const release = "piyushsatti/chronicler/.github/workflows/deploy-production.yml@refs/tags/"
	for _, tc := range []struct {
		event, ref string
		admit      bool
	}{
		{"push", release + "2026.10.31", true},
		{"push", release + "2026.10.31.2", true},
		{"push", release + "staging-2026.10.31.1", false},
		{"push", release + "2026.10.31.x", false},
		{"push", "piyushsatti/chronicler/.github/workflows/deploy-production.yml@refs/heads/main", false},
		{"push", "piyushsatti/chronicler/.github/workflows/deploy-staging.yml@refs/tags/2026.10.31", false},
		{"push", "someone/fork/.github/workflows/deploy-production.yml@refs/tags/2026.10.31", false},
		{"workflow_dispatch", release + "2026.10.31", false},
		{"push", "", false},
	} {
		cmd := exec.Command("bash", hook)
		cmd.Env = []string{"GITHUB_EVENT_NAME=" + tc.event, "GITHUB_WORKFLOW_REF=" + tc.ref}
		if err := cmd.Run(); (err == nil) != tc.admit {
			t.Errorf("event=%q ref=%q: admitted=%v, want %v (%v)", tc.event, tc.ref, err == nil, tc.admit, err)
		}
	}
}

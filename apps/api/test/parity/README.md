# Parity fixtures

Recorded responses from the old Python API, used to diff the Go `/v1` surface.

| Path             | Purpose                               |
| ---------------- | ------------------------------------- |
| `fixtures/`      | JSON request/response pairs per slice |
| `runner_test.go` | Diff harness (added as slices land)   |

Recording is done against a local old-API process when available. Differences are allowed only when a decision record explains them.

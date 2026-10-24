// Command worker runs the background-job loop on its own (used by the dev
// compose stack). Production runs the same loop inside cmd/api.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/workerrun"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := workerrun.Run(ctx, config.FromEnv()); err != nil {
		slog.Error("worker stopped", "error", err)
	}
}

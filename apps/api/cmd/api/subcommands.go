package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/migrate"
)

const subcommandUsage = "usage: api [migrate [up|status] | healthcheck]"

// runSubcommand handles `api <command>` (distroless images have no shell, so
// the binary carries its own migration and healthcheck entry points).
// It returns the process exit code.
func runSubcommand(args []string, stdout, stderr io.Writer) int {
	ctx := context.Background()
	switch args[0] {
	case "migrate":
		action := "up"
		if len(args) > 1 {
			action = args[1]
		}
		dsn := os.Getenv("DATABASE_URL")
		var err error
		switch action {
		case "up":
			err = migrate.Up(ctx, dsn, stdout)
		case "status":
			err = migrate.Status(ctx, dsn, stdout)
		default:
			fmt.Fprintln(stderr, "unknown migrate action:", action, "(want up or status)")
			return 2
		}
		if err != nil {
			fmt.Fprintln(stderr, "migrate failed:", err)
			return 1
		}
		return 0
	case "healthcheck":
		if err := healthcheck(ctx, config.FromEnv().Addr); err != nil {
			fmt.Fprintln(stderr, "unhealthy:", err)
			return 1
		}
		return 0
	default:
		fmt.Fprintln(stderr, "unknown command:", args[0])
		fmt.Fprintln(stderr, subcommandUsage)
		return 2
	}
}

// healthcheck GETs /health on the loopback address of the configured listen port.
func healthcheck(ctx context.Context, addr string) error {
	_, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		port = "8080"
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+net.JoinHostPort("127.0.0.1", port)+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

//go:build integration

package dbtest

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

const productTemplateDatabase = "product_template"

var productFixtureProcess struct {
	once   sync.Once
	server *productFixtureServer
	err    error
}

type productFixtureServer struct {
	container   *postgres.PostgresContainer
	admin       *db.Pool
	databaseURL string
	next        atomic.Uint64
}

type ProductFixture struct {
	Pool         *db.Pool
	Admin        *db.Pool
	DatabaseURL  string
	DatabaseName string
	server       *productFixtureServer
	closeOnce    sync.Once
	closeErr     error
}

func CloseProductFixtures() error {
	var err error
	if productFixtureProcess.server != nil {
		err = productFixtureProcess.server.close()
	}
	return err
}

func NewProductFixture(t testing.TB) *ProductFixture {
	t.Helper()
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("product integration fixtures reject external DATABASE_URL; omit DATABASE_URL")
	}
	productFixtureProcess.once.Do(func() {
		productFixtureProcess.server, productFixtureProcess.err = startproductFixtureServer()
	})
	if productFixtureProcess.err != nil {
		t.Fatalf("start owned product PostgreSQL fixture: %v", productFixtureProcess.err)
	}
	server := productFixtureProcess.server
	name := fmt.Sprintf("product_case_%d", server.next.Add(1))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := server.admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()+" TEMPLATE "+pgx.Identifier{productTemplateDatabase}.Sanitize()); err != nil {
		t.Fatalf("clone migrations-only fixture: %v", err)
	}
	f := &ProductFixture{DatabaseName: name, DatabaseURL: productDatabaseURL(server.databaseURL, name), Admin: server.admin, server: server}
	t.Cleanup(func() {
		if err := f.Close(); err != nil {
			t.Errorf("drop owned product fixture: %v", err)
		}
	})
	pool, err := db.Connect(ctx, f.DatabaseURL)
	if err != nil {
		t.Fatalf("connect isolated product fixture: %v", err)
	}
	f.Pool = pool
	return f
}

func startproductFixtureServer() (server *productFixtureServer, err error) {
	server = &productFixtureServer{}
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("PostgreSQL fixture startup panicked: %v", recovered)
		}
		if err != nil {
			if cleanupErr := server.close(); cleanupErr != nil {
				err = fmt.Errorf("%w; startup cleanup: %v", err, cleanupErr)
			}
			server = nil
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	server.container, err = postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase(productTemplateDatabase),
		postgres.WithUsername("product_fixture"),
		postgres.WithPassword("synthetic-product-fixture"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		return server, fmt.Errorf("start PostgreSQL 16 container: %w", err)
	}
	server.databaseURL, err = server.container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return server, fmt.Errorf("resolve PostgreSQL fixture URL: %w", err)
	}
	if err = migrateProductTemplate(ctx, server.databaseURL); err != nil {
		return server, err
	}
	server.admin, err = db.Connect(ctx, productDatabaseURL(server.databaseURL, "postgres"))
	if err != nil {
		return server, fmt.Errorf("connect fixture administration: %w", err)
	}
	if _, err = server.admin.Exec(ctx, "ALTER DATABASE "+pgx.Identifier{productTemplateDatabase}.Sanitize()+" WITH ALLOW_CONNECTIONS false"); err != nil {
		return server, fmt.Errorf("close migrations-only template to connections: %w", err)
	}
	return server, nil
}

func migrateProductTemplate(ctx context.Context, databaseURL string) error {
	migrationDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open product migration connection: %w", err)
	}
	defer migrationDB.Close()
	root, err := moduleRoot()
	if err != nil {
		return err
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, migrationDB, os.DirFS(filepath.Join(root, "db", "migrations")))
	if err != nil {
		return fmt.Errorf("construct product migration provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("migrate product template: %w", err)
	}
	return nil
}

func productDatabaseURL(databaseURL, databaseName string) string {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		panic(fmt.Sprintf("testcontainers returned invalid PostgreSQL URL: %v", err))
	}
	parsed.Path = "/" + databaseName
	return parsed.String()
}

func (s *productFixtureServer) close() error {
	if s.admin != nil {
		s.admin.Close()
	}
	if s.container == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return s.container.Terminate(ctx)
}

func (f *ProductFixture) Close() error {
	f.closeOnce.Do(func() {
		if f.Pool != nil {
			f.Pool.Close()
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, f.closeErr = f.server.admin.Exec(ctx, "DROP DATABASE "+pgx.Identifier{f.DatabaseName}.Sanitize()+" WITH (FORCE)")
	})
	return f.closeErr
}

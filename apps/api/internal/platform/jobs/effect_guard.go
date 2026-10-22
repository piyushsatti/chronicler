package jobs

import (
	"context"
	"errors"
	"reflect"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type EffectGuard interface {
	Admit(context.Context, Receipt) (EffectPermit, error)
	Recheck(context.Context, EffectPermit) error
}

type PostgresEffectGuard struct {
	DB pgx.Tx
}

type EffectPermit struct {
	owner   *PostgresEffectGuard
	receipt Receipt
	kind    string
}

func (p EffectPermit) Kind() string { return p.kind }

func NewEffectGuard(tx pgx.Tx) (*PostgresEffectGuard, error) {
	if tx == nil || reflect.ValueOf(tx).Kind() == reflect.Pointer && reflect.ValueOf(tx).IsNil() {
		return nil, errors.New("effect guard requires the owning transaction")
	}
	return &PostgresEffectGuard{DB: tx}, nil
}

func (g *PostgresEffectGuard) current(ctx context.Context, receipt Receipt) (Job, error) {
	if g == nil || g.DB == nil {
		return Job{}, errors.New("effect guard requires the owning transaction")
	}
	token, err := ParseToken(receipt.Token)
	if err != nil {
		return Job{}, err
	}
	id, err := strconv.ParseInt(receipt.ID, 10, 64)
	if err != nil || id < 1 || strconv.FormatInt(id, 10) != receipt.ID {
		return Job{}, ErrMissing
	}
	q := dbgen.New(g.DB)
	row, err := q.LockJob(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrMissing
	}
	if err != nil {
		return Job{}, err
	}
	clock, err := q.JobClock(ctx)
	if err != nil {
		return Job{}, err
	}
	job := fromRow(row)
	if !clock.Valid || !job.owns(token, clock.Time) {
		return Job{}, ErrLease
	}
	return job, nil
}

func (g *PostgresEffectGuard) Admit(ctx context.Context, receipt Receipt) (EffectPermit, error) {
	job, err := g.current(ctx, receipt)
	if err != nil {
		return EffectPermit{}, err
	}
	return EffectPermit{owner: g, receipt: receipt, kind: job.Kind}, nil
}

func (g *PostgresEffectGuard) Recheck(ctx context.Context, permit EffectPermit) error {
	if permit.owner == nil || permit.owner != g {
		return ErrLease
	}
	job, err := g.current(ctx, permit.receipt)
	if err != nil {
		return err
	}
	if job.Kind != permit.kind {
		return ErrLease
	}
	return nil
}

var _ EffectGuard = (*PostgresEffectGuard)(nil)

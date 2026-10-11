import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import type { MemberRoleForm } from '../personRoles.js';
import type { useBulkRoleBar } from '../hooks/useBulkRoleBar.js';

export function BulkRoleBar({
  view,
}: {
  view: ReturnType<typeof useBulkRoleBar>;
}): React.JSX.Element {
  const {
    submittedMembers,
    report,
    requiresExplicitChoice,
    form,
    setForm,
    touched,
    setTouched,
    batch,
    selected,
  } = view;

  if (selected.length === 0) {
    return (
      <p className="type-caption" data-el="admin.bulkRoleBar.empty">
        Select members to edit roles in bulk.
      </p>
    );
  }

  const canSubmit =
    !batch.isPending && (!requiresExplicitChoice || touched) && selected.length > 0;

  return (
    <Card className="stack" data-component="BulkRoleBar" data-el="admin.bulkRoleBar">
      <h4 className="type-heading">Bulk roles · {selected.length} selected</h4>
      {requiresExplicitChoice ? (
        <p className="type-caption">
          Selection has mixed roles — touch a control before applying (prevents mass
          wipe).
        </p>
      ) : null}
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Base</span>
          <select
            className="field"
            value={form.baseTier}
            onChange={(e) => {
              setTouched(true);
              setForm((f) => ({
                ...f,
                baseTier: e.target.value as MemberRoleForm['baseTier'],
              }));
            }}
          >
            <option value="Player">Player</option>
            <option value="Spectator">Spectator</option>
          </select>
        </label>
        {(
          [
            ['grantDm', 'DM'],
            ['grantArchon', 'Archon'],
            ['grantLieutenant', 'Lieutenant'],
            ['grantVerifier', 'Verifier'],
            ['grantAdmin', 'Admin'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="row">
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => {
                setTouched(true);
                setForm((f) => ({ ...f, [key]: e.target.checked }));
              }}
            />
            <span className="type-caption">{label}</span>
          </label>
        ))}
      </div>
      <Button type="button" disabled={!canSubmit} onClick={() => batch.mutate()}>
        Apply roles to selection
      </Button>
      {batch.isError ? (
        <p className="type-caption" role="alert">
          {batch.error.userMessage}
        </p>
      ) : null}
      {report.length > 0 ? (
        <ul className="stack" data-el="admin.bulkRoleBar.report">
          {report.map((row) => {
            const member = submittedMembers.find((m) => m.id === row.id);
            return (
              <li key={row.id} className="type-caption">
                @{member?.handle ?? row.id}: {row.ok ? 'ok' : (row.error ?? 'failed')}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

import { useId } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import type { useBulkRoleBar } from '../hooks/useBulkRoleBar.js';
import { memberLabeler } from '../../../utils/format.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Select } from '../../../components/primitives/Select.js';

export function BulkRoleBar({
  view,
}: {
  view: ReturnType<typeof useBulkRoleBar>;
}): React.JSX.Element {
  const roleLabelId = useId();
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

  const disabled = batch.isPending || selected.length === 0;
  const labelFor = memberLabeler(submittedMembers);

  const canSubmit =
    !batch.isPending && (!requiresExplicitChoice || touched) && selected.length > 0;

  return (
    <Card className="stack" data-component="BulkRoleBar" data-el="admin.bulkRoleBar">
      <h3 className="type-heading">Bulk roles · {selected.length} selected</h3>
      <p className="type-caption">
        Select members below and choose the roles to give them. Different roles
        require an explicit choice.
      </p>
      <div className="row" data-wrap="1">
        <div className="stack">
          <span className="type-label" id={roleLabelId}>Base role</span>
          <Select
            label="Base role"
            labelId={roleLabelId}
            disabled={disabled}
            value={form.baseTier}
            onValueChange={(value) => {
              setTouched(true);
              setForm((f) => ({
                ...f,
                baseTier: value === 'Spectator' ? 'Spectator' : 'Player',
              }));
            }}
            options={[
              { value: 'Player', label: 'Player' },
              { value: 'Spectator', label: 'Spectator' },
            ]}
          />
        </div>
        {(
          [
            ['grantDm', 'DM'],
            ['grantArchon', 'Archon'],
            ['grantLieutenant', 'Lieutenant'],
            ['grantVerifier', 'Verifier'],
            ['grantAdmin', 'Admin'],
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            disabled={disabled}
            checked={form[key]}
            onCheckedChange={(checked) => {
              setTouched(true);
              setForm((f) => ({ ...f, [key]: checked }));
            }}
          />
        ))}
      </div>
      <Button type="button" disabled={!canSubmit} onClick={() => batch.mutate()}>
        Apply roles to selection
      </Button>
      {batch.isError ? (
        <p className="type-caption" role="alert">
          {batch.error?.userMessage ?? 'Role changes could not be saved.'}
        </p>
      ) : null}
      {report.length > 0 ? (
        <ul className="stack" data-el="admin.bulkRoleBar.report">
          {report.map((row) => {
            const member = submittedMembers.find((m) => m.id === row.id);
            return (
              <li key={row.id} className="type-caption">
                {member ? labelFor(member) : 'Member'}:{' '}
                {row.ok ? 'saved' : (row.error ?? 'failed')}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

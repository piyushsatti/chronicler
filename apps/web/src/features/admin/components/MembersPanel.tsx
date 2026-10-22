import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { BulkRoleBar } from './BulkRoleBar.js';
import type { useMembersPanel } from '../hooks/useMembersPanel.js';
import { useId, useLayoutEffect, useRef } from 'react';
import { listLabel, roleLabel, statusLabel } from '../../../utils/format.js';
import './MembersPanel.css';
import { Checkbox } from '../../../components/primitives/Checkbox.js';

const MEMBER_STATUSES = ['active', 'inactive', 'banned'] as const;

export function MembersPanel({
  view,
}: {
  view: ReturnType<typeof useMembersPanel>;
}): React.JSX.Element {
  const {
    ROLE_OPTIONS,
    searchInput,
    setSearchInput,
    selected,
    setSelected,
    draftRoles,
    setDraftRoles,
    checkedIds,
    setCheckedIds,
    directory,
    saveRoles,
    bulkBar,
  } = view;
  const inspectorId = useId();
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const memberButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (selected) inspectorHeading.current?.focus();
    else if (returnFocus.current) {
      (memberButtons.current.get(returnFocus.current) ?? search.current)?.focus();
      returnFocus.current = null;
    }
  }, [selected]);

  if (directory.isError) {
    return <AdminReadFailure error={directory.error} retry={directory.retry} />;
  }
  if (directory.isLoading || !directory.data) {
    return <StatePanel status="loading" />;
  }
  const members = directory.data;

  return (
    <section
      className="members-directory-panel stack"
      data-el="admin.membersPanel"
      aria-label="Members & roles"
    >
      <label className="stack">
        <span className="type-label">Search</span>
        <input
          ref={search}
          disabled={saveRoles.isPending || bulkBar.batch.isPending}
          className="field-input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Handle or display name"
        />
      </label>
      <AdminPagination page={view.pagination} />
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Role filter</span>
          <select
            className="field-input"
            value={view.role}
            onChange={(e) => view.setRole(e.target.value)}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span className="type-label">Status filter</span>
          <select
            className="field-input"
            value={view.status}
            onChange={(e) => view.setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <BulkRoleBar view={bulkBar} />
      {directory.data.length === 0 ? (
        <EmptyState kind="generic" message="No members match this filter." />
      ) : (
        <div
          className="members-directory-workspace"
          data-inspector-open={selected !== null}
        >
          <ul className="members-directory-list" aria-label="Members" role="list">
            {directory.data.map((member) => (
              <li key={member.id}>
                <Card
                  className="stack"
                  pad={3}
                  data-selected={selected?.id === member.id ? 'true' : undefined}
                >
                  <div className="admin-member-row row">
                    <Checkbox
                      ariaLabel={`Select @${member.handle}`}
                      disabled={saveRoles.isPending || bulkBar.batch.isPending}
                      checked={checkedIds.has(member.id)}
                      onCheckedChange={(checked) => {
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(member.id);
                          else next.delete(member.id);
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      ref={(button) => {
                        if (button) memberButtons.current.set(member.id, button);
                        else memberButtons.current.delete(member.id);
                      }}
                      disabled={saveRoles.isPending || bulkBar.batch.isPending}
                      className="admin-member-row__select"
                      aria-controls={inspectorId}
                      aria-expanded={selected?.id === member.id}
                      onClick={() => {
                        setSelected(member);
                        setDraftRoles([...member.roles]);
                      }}
                    >
                      <span className="type-title">{member.displayName}</span>
                      <span className="type-code">@{member.handle}</span>
                      <span className="type-caption">
                        {listLabel(member.roles.map(roleLabel)) || 'No roles'}
                      </span>
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <aside
            id={inspectorId}
            className="members-inspector-pane stack"
            aria-label="Role editor"
          >
            {selected ? (
              <Card className="stack">
                <Button
                  type="button"
                  variant="ghost"
                  className="members-directory-back"
                  disabled={saveRoles.isPending || bulkBar.batch.isPending}
                  onClick={() => {
                    returnFocus.current = selected.id;
                    setSelected(null);
                  }}
                >
                  Back to members
                </Button>
                <h3 className="type-heading" ref={inspectorHeading} tabIndex={-1}>
                  @{selected.handle}
                </h3>
                <div className="stack">
                  {ROLE_OPTIONS.map((role) => (
                    <Checkbox
                      key={role}
                      label={roleLabel(role)}
                      disabled={saveRoles.isPending || bulkBar.batch.isPending}
                      checked={draftRoles.includes(role)}
                      onCheckedChange={(checked) => {
                        setDraftRoles((current) =>
                          checked
                            ? Array.from(new Set([...current, role]))
                            : current.filter((item) => item !== role),
                        );
                      }}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={saveRoles.isPending}
                  onClick={() => saveRoles.mutate()}
                >
                  Save roles
                </Button>
                {saveRoles.isError ? (
                  <StatePanel status="error" error={saveRoles.error} />
                ) : null}
              </Card>
            ) : (
              <Card className="stack members-inspector-empty" tone="flat" data-gap="3">
                <span className="type-label">Role editor</span>
                <h3 className="type-title">No member selected</h3>
                <p className="type-body">
                  Choose a member from the list to review and change their roles. Tick
                  several members to change roles for all of them at once.
                </p>
                <dl className="members-role-summary">
                  {ROLE_OPTIONS.map((role) => (
                    <div key={role}>
                      <dt className="type-caption">{roleLabel(role)}</dt>
                      <dd className="type-ui">
                        {members.filter((member) => member.roles.includes(role)).length}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="type-caption">Role counts are for the members shown.</p>
              </Card>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

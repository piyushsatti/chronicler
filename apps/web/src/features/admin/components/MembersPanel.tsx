import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { memberLabeler } from '../memberLabels.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { BulkRoleBar } from './BulkRoleBar.js';
import type { useMembersPanel } from '../hooks/useMembersPanel.js';
import { useLayoutEffect, useRef } from 'react';
import {
  handleLabel,
  pluralize,
  roleLabel,
  statusLabel,
} from '../../../utils/format.js';
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
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const memberButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (selected) editorHeading.current?.focus();
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
  const labelFor = memberLabeler(members);

  return (
    <section
      className="members-directory-panel stack"
      data-el="admin.membersPanel"
      aria-label="Members & roles"
    >
      <FilterBar
        label="Filter members"
        count={
          view.pagination.total !== null
            ? pluralize(view.pagination.total, 'member')
            : pluralize(members.length, 'member')
        }
      >
        <FilterBar.Search
          label="Search members"
          placeholder="Search by name or handle"
          value={searchInput}
          onValueChange={setSearchInput}
          inputRef={search}
        />
        <FilterBar.Picker
          label="Role"
          value={view.role}
          onValueChange={view.setRole}
          options={[
            { value: '', label: 'All roles' },
            ...ROLE_OPTIONS.map((role) => ({ value: role, label: roleLabel(role) })),
          ]}
        />
        <FilterBar.Group>
          <Chip selected={view.status === ''} onClick={() => view.setStatus('')}>
            All
          </Chip>
          {MEMBER_STATUSES.map((status) => (
            <Chip
              key={status}
              selected={view.status === status}
              onClick={() => view.setStatus(status)}
            >
              {statusLabel(status)}
            </Chip>
          ))}
        </FilterBar.Group>
      </FilterBar>
      <AdminPagination page={view.pagination} />
      <BulkRoleBar view={bulkBar} />
      {selected ? (
        <Card
          as="section"
          className="stack"
          aria-label="Role editor"
          data-el="admin.roleEditor"
        >
          <h3 className="type-heading" ref={editorHeading} tabIndex={-1}>
            {labelFor(selected)}
          </h3>
          <div className="row" data-wrap="1">
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
          <div className="row" data-wrap="1">
            <Button
              type="button"
              disabled={saveRoles.isPending}
              onClick={() => saveRoles.mutate()}
            >
              Save roles
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saveRoles.isPending || bulkBar.batch.isPending}
              onClick={() => {
                returnFocus.current = selected.id;
                setSelected(null);
              }}
            >
              Back to members
            </Button>
          </div>
          {saveRoles.isError ? (
            <StatePanel status="error" error={saveRoles.error} />
          ) : null}
        </Card>
      ) : null}
      {members.length === 0 ? (
        <EmptyState kind="generic" message="No members match these filters." />
      ) : (
        <CardGrid as="ul" aria-label="Members">
          {members.map((member) => (
            <li key={member.id}>
              <Card
                className="stack"
                pad={3}
                data-selected={selected?.id === member.id ? 'true' : undefined}
              >
                <div className="admin-member-row row">
                  <Checkbox
                    ariaLabel={`Select ${labelFor(member)}`}
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
                    aria-expanded={selected?.id === member.id}
                    onClick={() => {
                      setSelected(member);
                      setDraftRoles([...member.roles]);
                    }}
                  >
                    <Avatar name={labelFor(member)} size="sm" online={false} />
                    <span className="admin-member-row__name">
                      <span className="type-title">{labelFor(member)}</span>
                      {handleLabel(member.handle) &&
                      !labelFor(member)
                        .toLocaleLowerCase()
                        .includes((handleLabel(member.handle) ?? '').slice(1)) ? (
                        <span className="type-caption">
                          {handleLabel(member.handle)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
                <Chip.Row>
                  {member.roles.length === 0 ? (
                    <Chip tone="line" size="sm">
                      No roles
                    </Chip>
                  ) : (
                    member.roles.map((role) => (
                      <Chip key={role} size="sm">
                        {roleLabel(role)}
                      </Chip>
                    ))
                  )}
                </Chip.Row>
              </Card>
            </li>
          ))}
        </CardGrid>
      )}
    </section>
  );
}

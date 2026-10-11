import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { BulkRoleBar } from './BulkRoleBar.js';
import type { useMembersPanel } from '../hooks/useMembersPanel.js';

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

  if (directory.isError) {
    return <StatePanel status="error" error={directory.error} />;
  }
  if (directory.isLoading || !directory.data) {
    return <StatePanel status="loading" />;
  }

  return (
    <section
      className="stack"
      data-el="admin.membersPanel"
      aria-label="Members & roles"
    >
      <div className="sec-label">
        <h3>Members &amp; roles</h3>
      </div>
      <label className="stack">
        <span className="type-label">Search</span>
        <input
          className="field"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Handle or display name"
        />
      </label>
      <BulkRoleBar view={bulkBar} />
      {directory.data.length === 0 ? (
        <EmptyState kind="generic" message="No members match this filter." />
      ) : (
        <div className="row" data-align="start">
          <ul className="stack" style={{ flex: 1 }}>
            {directory.data.map((member) => (
              <li key={member.id}>
                <Card
                  className="stack"
                  data-selected={selected?.id === member.id ? 'true' : undefined}
                >
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={checkedIds.has(member.id)}
                      onChange={(event) => {
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(member.id);
                          else next.delete(member.id);
                          return next;
                        });
                      }}
                      aria-label={`Select @${member.handle}`}
                    />
                    <button
                      type="button"
                      className="stack"
                      style={{ all: 'unset', cursor: 'pointer', flex: 1 }}
                      onClick={() => {
                        setSelected(member);
                        setDraftRoles([...member.roles]);
                      }}
                    >
                      <span className="type-title">{member.displayName}</span>
                      <span className="type-code">@{member.handle}</span>
                      <span className="type-caption">
                        {member.roles.join(' · ') || 'no roles'}
                      </span>
                    </button>
                  </label>
                </Card>
              </li>
            ))}
          </ul>
          <aside className="stack" style={{ flex: 1 }} aria-label="Role editor">
            {selected ? (
              <Card className="stack">
                <h4 className="type-heading">@{selected.handle}</h4>
                <div className="stack">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={role} className="row">
                      <input
                        type="checkbox"
                        checked={draftRoles.includes(role)}
                        onChange={(event) => {
                          setDraftRoles((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, role]))
                              : current.filter((item) => item !== role),
                          );
                        }}
                      />
                      <span className="type-body">{role}</span>
                    </label>
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
              <p className="type-caption">Select a member to edit roles.</p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

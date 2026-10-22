import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Button } from '../../../components/primitives/Button.js';
import { pluralize, weekdayList } from '../../../utils/format.js';
import { useCommunityDirectoryPage } from '../hooks/useCommunityDirectoryPage.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Field } from '../../../components/foundation/Field.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import styles from './directory.module.css';
export function MemberDirectoryPage({ role }: { role: 'dm' | 'player' }) {
  const state = useCommunityDirectoryPage(role);
  const title = role === 'dm' ? 'Dungeon Masters' : 'Players';
  const declaration: PageDeclaration = {
    page: role === 'dm' ? 'dms-directory' : 'players-directory',
    regions: [{ role: 'body', priority: 1 }],
  };
  return (
    <PageShell context="tavern" className="hf2">
      <PageHost
        declaration={declaration}
        regions={{
          body: () => (
            <div className={styles.page}>
              <header className={styles.header}>
                <div className="stack" data-gap="2">
                  <Link className="type-caption" to="/community">
                    ← Community
                  </Link>
                  <h1 className="type-display">{title}</h1>
                  {state.status === 'ready' ? (
                    <p className="type-caption">
                      {pluralize(state.view.total, 'member')}
                    </p>
                  ) : null}
                </div>
                <div className={styles.filters}>
                  <Field
                    label="Search members"
                    type="search"
                    maxLength={200}
                    placeholder="Name or handle"
                    value={state.search}
                    onChange={(event) => state.setSearch(event.target.value)}
                  />
                  {role === 'dm' ? (
                    <Checkbox
                      label="Accepting players only"
                      checked={state.acceptingOnly}
                      onCheckedChange={state.setAcceptingOnly}
                    />
                  ) : null}
                </div>
              </header>
              {state.status === 'error' ? (
                <div className="stack" data-gap="3">
                  <StatePanel status="error" error={state.error} />
                  <Button
                    variant="secondary"
                    className={styles.start}
                    onClick={state.retry}
                  >
                    Retry members
                  </Button>
                </div>
              ) : state.status === 'loading' ? (
                <div className={styles.grid} aria-busy="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} height="7rem" aria-label="Loading members" />
                  ))}
                </div>
              ) : state.status === 'empty' ? (
                <StatePanel
                  status="empty"
                  emptyMessage="No members match these filters."
                />
              ) : (
                <>
                  <div className={styles.grid}>
                    {state.view.items.map((member) => (
                      <Card
                        key={member.memberId}
                        variant="clickable"
                        to={`/${role === 'dm' ? 'dms' : 'players'}/@${member.handle}`}
                        className={styles.card}
                        pad={4}
                      >
                        <Avatar
                          name={member.displayName || member.handle}
                          src={member.avatarUrl ?? undefined}
                          size="md"
                        />
                        <div className={styles.cardBody}>
                          <h2 className="type-title">{member.displayName}</h2>
                          <p className="type-caption">@{member.handle}</p>
                          {member.tagline ? (
                            <p className={`type-body ${styles.tagline}`}>
                              {member.tagline}
                            </p>
                          ) : null}
                          <div className={styles.chips}>
                            {member.isDm ? (
                              <Chip
                                size="sm"
                                tone={member.acceptingPlayers ? 'accent' : 'line'}
                              >
                                {member.acceptingPlayers
                                  ? 'Accepting players'
                                  : 'Not accepting players'}
                              </Chip>
                            ) : null}
                            {member.availableDays.length ? (
                              <Chip size="sm" tone="neutral">
                                Available{' '}
                                {weekdayList(member.availableDays, { plural: true })}
                              </Chip>
                            ) : (
                              <Chip size="sm" tone="line">
                                No availability set
                              </Chip>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  {state.pageCount > 1 ? (
                    <nav
                      className="row"
                      data-wrap="1"
                      data-align="center"
                      data-gap="3"
                      aria-label="Member pages"
                    >
                      <Button
                        variant="ghost"
                        disabled={state.page === 1 || state.isFetching}
                        onClick={() => state.setPage(state.page - 1)}
                      >
                        Previous members
                      </Button>
                      <span className="type-caption">
                        Page {state.page} · {pluralize(state.view.total, 'member')}
                      </span>
                      <Button
                        variant="ghost"
                        disabled={state.page >= state.pageCount || state.isFetching}
                        onClick={() => state.setPage(state.page + 1)}
                      >
                        Next members
                      </Button>
                    </nav>
                  ) : null}
                </>
              )}
            </div>
          ),
        }}
      />
    </PageShell>
  );
}
export function DmsDirectoryPage() {
  return <MemberDirectoryPage role="dm" />;
}

import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Button } from '../../../components/primitives/Button.js';
import { handleLabel, pluralize, weekdayList } from '../../../utils/format.js';
import { memberLabeler } from '../memberLabels.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useCommunityDirectoryPage } from '../hooks/useCommunityDirectoryPage.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import styles from './directory.module.css';
export function MemberDirectoryPage({ role }: { role: 'dm' | 'player' }) {
  const state = useCommunityDirectoryPage(role);
  const memberHref = useMemberHref();
  const labelFor = memberLabeler(state.status === 'ready' ? state.view.items : []);
  const title = role === 'dm' ? 'DMs' : 'Players';
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
              <PageHeader
                back={{ to: '/community', label: 'Community' }}
                title={title}
              />
              <FilterBar
                label={`Filter ${title.toLowerCase()}`}
                count={
                  state.status === 'ready'
                    ? pluralize(state.view.total, role === 'dm' ? 'DM' : 'player')
                    : undefined
                }
              >
                <FilterBar.Search
                  label="Search members"
                  placeholder="Name or handle"
                  value={state.search}
                  onValueChange={state.setSearch}
                />
                {role === 'dm' ? (
                  <FilterBar.Group>
                    <Chip
                      selected={state.acceptingOnly}
                      onClick={() => state.setAcceptingOnly(!state.acceptingOnly)}
                    >
                      Accepting players
                    </Chip>
                  </FilterBar.Group>
                ) : null}
              </FilterBar>
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
                <CardGrid gap={3}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} height="7rem" aria-label="Loading members" />
                  ))}
                </CardGrid>
              ) : state.status === 'empty' ? (
                <EmptyState
                  message="No members match these filters."
                  action={
                    state.search || state.acceptingOnly ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          state.setSearch('');
                          state.setAcceptingOnly(false);
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <CardGrid gap={3}>
                    {state.view.items.map((member) => {
                      const label = labelFor(member);
                      return (
                        <Card
                          key={member.memberId}
                          variant="clickable"
                          to={memberHref(member, role)}
                          className={styles.card}
                          pad={4}
                        >
                          <Avatar
                            name={label}
                            src={member.avatarUrl ?? undefined}
                            size="md"
                          />
                          <div className={styles.cardBody}>
                            <h2 className="type-title">{label}</h2>
                            {handleLabel(member.handle) &&
                            !label.includes(handleLabel(member.handle) ?? '') ? (
                              <p className="type-caption">
                                {handleLabel(member.handle)}
                              </p>
                            ) : null}
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
                              ) : null}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </CardGrid>
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
                        Page {state.page} of {state.pageCount}
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

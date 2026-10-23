import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Button } from '../../../components/primitives/Button.js';
import { WeekGrid, bucketFor } from '../../../components/primitives/WeekGrid.js';
import { useToast } from '../../../hooks/useToast.js';
import { useCommunityCharacters, useCommunityPage } from '../hooks/useCommunityPage.js';
import type { CommunityMemberView } from '../types.js';
import { memberLabeler } from '../memberLabels.js';
import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { useState } from 'react';
import {
  characterStatusLabel,
  personName,
  pluralize,
  weekdayList,
} from '../../../utils/format.js';
import styles from './community.module.css';

const TAB_IDS = ['muster', 'dms', 'players', 'characters'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAGE_SIZE = 12;

function MemberList({
  members,
  empty,
  profileBase,
  action,
  paged = false,
}: {
  members: CommunityMemberView[];
  empty: string;
  profileBase?: '/dms' | '/players';
  action?: React.ReactNode;
  /** Cap the list with a "Show more" button. */
  paged?: boolean;
}): React.JSX.Element {
  const memberHref = useMemberHref();
  const [shown, setShown] = useState(PAGE_SIZE);
  const labelFor = memberLabeler(members);
  if (members.length === 0) {
    return <EmptyState message={empty} action={action} />;
  }
  const visible = paged ? members.slice(0, shown) : members;
  return (
    <div className="stack" data-gap="4">
      <CardGrid gap={3}>
        {visible.map((member) => (
          <Card
            key={member.memberId}
            variant="clickable"
            to={memberHref(
              member,
              (profileBase ?? (member.isDm ? '/dms' : '/players')) === '/dms'
                ? 'dm'
                : 'player',
            )}
            className={styles.member}
            pad={4}
          >
            <Avatar
              name={labelFor(member)}
              src={member.avatarUrl ?? undefined}
              size="md"
              online={false}
            />
            <div className={styles.memberBody}>
              <div className={styles.memberHead}>
                <span className="type-title">{labelFor(member)}</span>
                {member.isDm && member.acceptingPlayers ? (
                  <Chip size="sm" tone="accent">
                    Accepting
                  </Chip>
                ) : null}
              </div>
              {member.availableDays.length ? (
                <span className="type-caption">
                  Free {weekdayList(member.availableDays, { plural: true })}
                </span>
              ) : null}
              {member.tagline ? (
                <span className={`type-caption ${styles.tagline}`}>
                  {member.tagline}
                </span>
              ) : null}
            </div>
          </Card>
        ))}
      </CardGrid>
      {paged && members.length > shown ? (
        <Button
          variant="secondary"
          className={styles.loadMore}
          onClick={() => setShown(shown + PAGE_SIZE)}
        >
          Show more ({members.length - shown} more)
        </Button>
      ) : null}
    </div>
  );
}

export function CommunityPage(): React.JSX.Element {
  const page = useCommunityPage();
  const { addToast } = useToast();
  const characters = useCommunityCharacters();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = TAB_IDS.includes(requestedTab ?? '')
    ? (requestedTab as string)
    : 'muster';
  const selectTab = (id: string): void => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'muster') next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  };
  const [query, setQuery] = useUrlParam('q');
  const [acceptingParam, setAcceptingParam] = useUrlParam('accepting');
  const accepting = acceptingParam === '1';
  const setAccepting = (value: boolean): void => setAcceptingParam(value ? '1' : '');
  const needle = query.trim().toLocaleLowerCase();
  const matches = (member: CommunityMemberView): boolean =>
    !needle ||
    personName(member).toLocaleLowerCase().includes(needle) ||
    member.handle.toLocaleLowerCase().includes(needle);
  const hubAll =
    page.status === 'ready' ? page.view : { dms: [], players: [], memberCount: 0 };
  const hub = {
    ...hubAll,
    dms: hubAll.dms.filter(
      (member) => matches(member) && (!accepting || member.acceptingPlayers),
    ),
    players: hubAll.players.filter(matches),
  };
  const members = [
    ...new Map(
      [...hub.dms, ...hub.players].map((entry) => [entry.memberId, entry]),
    ).values(),
  ];
  const byDay = new Map(
    DAYS.map((day) => [
      day,
      members.filter((member) =>
        member.availableDays.some(
          (value) => value.slice(0, 3).toLocaleLowerCase() === day.toLocaleLowerCase(),
        ),
      ),
    ]),
  );
  const visibleCharacters = (characters.data?.items ?? []).filter(
    (character) => !needle || character.name.toLocaleLowerCase().includes(needle),
  );
  const available = members.filter((member) => member.availableDays.length > 0);

  const filterBar = (count: string | undefined, extra?: React.ReactNode) => (
    <FilterBar className={styles.filters} label="Filter community" count={count}>
      <FilterBar.Search
        label="Search the community"
        placeholder="Search by name"
        value={query}
        onValueChange={setQuery}
      />
      {extra}
    </FilterBar>
  );
  const clearSearch = needle ? (
    <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
      Clear search
    </Button>
  ) : undefined;

  return (
    <PageShell context="tavern" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="community">
        <div className={styles.page}>
          <PageHeader
            title="Community"
            lede="See who's free, find a table, and browse everyone on the server."
          />
          {page.status === 'error' ? (
            <div className="stack" data-gap="3">
              <StatePanel
                status="error"
                error={page.error}
                onRetry={page.retry}
                retryLabel="Retry community"
              />
            </div>
          ) : page.status === 'loading' ? (
            <StatePanel status="loading" />
          ) : (
            <Tabs
              aria-label="Community sections"
              value={tab}
              onValueChange={selectTab}
              items={[
                {
                  id: 'muster',
                  label: 'Free this week',
                  panel: (
                    <div className="stack" data-gap="5">
                      {filterBar(pluralize(available.length, 'member'))}
                      <Card pad={4} className="stack" data-gap="3">
                        <h2 className="type-title">Members free each day</h2>
                        <WeekGrid
                          ariaLabel="Who's free this week"
                          heat={false}
                          className={styles.week}
                          days={[...byDay].map(([date, free]) => ({
                            date,
                            count: free.length,
                            bucket: bucketFor(free.length),
                          }))}
                          onDrillDown={(day) => {
                            const free = byDay.get(day) ?? [];
                            const label = memberLabeler(free);
                            addToast(
                              free.length
                                ? `${day}: ${free.map((member) => label(member)).join(', ')}`
                                : `${day}: no availability listed`,
                              'info',
                            );
                          }}
                          renderCell={(cell) => (
                            <div className={styles.day} data-empty={cell.count === 0}>
                              <span className="type-caption">{cell.date}</span>
                              <span className="type-value">{cell.count || '–'}</span>
                            </div>
                          )}
                        />
                      </Card>
                      <section className="stack" data-gap="3">
                        <h2 className="type-title">Members with availability</h2>
                        <MemberList
                          paged
                          members={available}
                          empty="No availability listed this week."
                          action={clearSearch}
                        />
                      </section>
                    </div>
                  ),
                },
                {
                  id: 'dms',
                  label: 'DMs',
                  panel: (
                    <div className="stack" data-gap="5">
                      {filterBar(
                        pluralize(hub.dms.length, 'DM'),
                        <FilterBar.Group>
                          <Chip
                            selected={accepting}
                            onClick={() => setAccepting(!accepting)}
                          >
                            Accepting players
                          </Chip>
                        </FilterBar.Group>,
                      )}
                      <MemberList
                        members={hub.dms}
                        empty="No DMs match."
                        profileBase="/dms"
                        action={clearSearch}
                      />
                    </div>
                  ),
                },
                {
                  id: 'players',
                  label: 'Players',
                  panel: (
                    <div className="stack" data-gap="5">
                      {filterBar(pluralize(hub.players.length, 'player'))}
                      <MemberList
                        members={hub.players}
                        empty="No players match."
                        profileBase="/players"
                        action={clearSearch}
                      />
                    </div>
                  ),
                },
                {
                  id: 'characters',
                  label: 'Characters',
                  panel: characters.isError ? (
                    <StatePanel status="error" error={characters.error ?? undefined} />
                  ) : characters.data ? (
                    <div className="stack" data-gap="5">
                      {filterBar(pluralize(visibleCharacters.length, 'character'))}
                      {visibleCharacters.length === 0 ? (
                        <EmptyState
                          message={
                            characters.data.items.length === 0
                              ? 'No characters in the roster yet.'
                              : 'No characters match.'
                          }
                          action={clearSearch}
                        />
                      ) : (
                        <CardGrid gap={3}>
                          {visibleCharacters.map((character) => (
                            <Card
                              key={character.id}
                              variant="clickable"
                              to={`/characters/${character.shortCode}`}
                              className="stack"
                              pad={4}
                            >
                              <span className="type-title">{character.name}</span>
                              <span className="type-caption">
                                {characterStatusLabel(character.status)}
                              </span>
                            </Card>
                          ))}
                        </CardGrid>
                      )}
                      {characters.hasMore ? (
                        <Button
                          variant="secondary"
                          className={styles.loadMore}
                          disabled={characters.isFetching}
                          onClick={characters.loadMore}
                        >
                          Load more characters
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <StatePanel status="loading" />
                  ),
                },
              ]}
            />
          )}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

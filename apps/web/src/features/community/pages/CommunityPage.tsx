import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
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
import { isCharacterImageUrl } from '../../../utils/characterImageUrl.js';
import type { CommunityCharacterView } from '../adapters/communityAdapter.js';
import styles from './community.module.css';

const TAB_IDS = ['muster', 'members', 'characters'] as const;
const ROLE_FILTERS = ['everyone', 'player', 'dm'] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];
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
                <div className={styles.memberRoles}>
                  {member.isDm ? <Chip size="sm" tone="line">DM</Chip> : null}
                  {member.roles.includes('player') || !member.isDm ? <Chip size="sm" tone="line">Player</Chip> : null}
                  {member.isDm && member.acceptingPlayers ? <Chip size="sm" tone="accent">Accepting players</Chip> : null}
                </div>
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

function CommunityCharacterCard({
  character,
  ownerName,
  regionName,
  regionNamesStatus,
}: {
  character: CommunityCharacterView;
  ownerName: string;
  regionName?: string;
  regionNamesStatus: 'loading' | 'ready' | 'error';
}): React.JSX.Element {
  const initials = character.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
  const region = character.regionId === null
    ? 'No region assigned'
    : regionName ?? (regionNamesStatus === 'loading' ? 'Loading region…' : regionNamesStatus === 'error' ? 'Region unavailable' : 'Region not listed');
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} className={styles.character} pad={4}>
      <Avatar name={initials || '?'} src={character.imageUrl && isCharacterImageUrl(character.imageUrl) ? character.imageUrl : undefined} size="md" />
      <div className={styles.characterBody}>
        <h2 className="type-title">{character.name}</h2>
        <p className="type-caption">{characterStatusLabel(character.status)} · {region}</p>
        <p className="type-caption">{ownerName}</p>
      </div>
    </Card>
  );
}

export function CommunityPage(): React.JSX.Element {
  const page = useCommunityPage();
  const { addToast } = useToast();
  const characters = useCommunityCharacters();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const legacyRole: RoleFilter | undefined = requestedTab === 'dms'
    ? 'dm'
    : requestedTab === 'players'
      ? 'player'
      : undefined;
  const tab = TAB_IDS.includes(requestedTab as (typeof TAB_IDS)[number])
    ? requestedTab as (typeof TAB_IDS)[number]
    : legacyRole ? 'members' : 'muster';
  const requestedRole = params.get('role');
  const roleFilter: RoleFilter = ROLE_FILTERS.includes(requestedRole as RoleFilter)
    ? requestedRole as RoleFilter
    : legacyRole ?? 'everyone';
  const selectTab = (id: string): void => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'muster') next.delete('tab');
        else next.set('tab', id);
        if (id !== 'members' && id !== 'muster') next.delete('role');
        return next;
      },
      { replace: true },
    );
  };
  const selectRole = (role: RoleFilter): void => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'members');
      if (role === 'everyone') next.delete('role');
      else next.set('role', role);
      return next;
    }, { replace: true });
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
  const allMembers = [
    ...new Map(
      [...hubAll.dms, ...hubAll.players].map((entry) => [entry.memberId, entry]),
    ).values(),
  ];
  const members = allMembers.filter((member) => {
    const hasRole = roleFilter === 'everyone'
      || (roleFilter === 'dm' && member.isDm)
      || (roleFilter === 'player' && (!member.isDm || member.roles.includes('player')));
    return hasRole && matches(member) && (roleFilter !== 'dm' || !accepting || member.acceptingPlayers);
  });
  const searchedMembers = allMembers.filter(matches);
  const labelForMember = memberLabeler(allMembers);
  const byDay = new Map(
    DAYS.map((day) => [
      day,
      searchedMembers.filter((member) =>
        member.availableDays.some(
          (value) => value.slice(0, 3).toLocaleLowerCase() === day.toLocaleLowerCase(),
        ),
      ),
    ]),
  );
  const visibleCharacters = (characters.data?.items ?? []).filter(
    (character) => !needle || character.name.toLocaleLowerCase().includes(needle),
  );
  const available = searchedMembers.filter((member) => member.availableDays.length > 0);

  const counts = {
    muster: pluralize(available.length, 'member'),
    members: pluralize(members.length, 'member'),
    characters:
      characters.data && !characters.isError
        ? pluralize(visibleCharacters.length, 'character')
        : undefined,
  };
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
              renderTrack={(track) => (
                <PageToolbar
                  label="Filter community"
                  segments={track}
                  count={counts[tab]}
                  actions={
                    <PageToolbar.Search
                      label="Search the community"
                      placeholder="Search by name"
                      value={query}
                      onValueChange={setQuery}
                    />
                  }
                />
              )}
              items={[
                {
                  id: 'muster',
                  label: 'Free this week',
                  panel: (
                    <div className="stack" data-gap="5">
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
                  id: 'members',
                  label: 'Members',
                  panel: (
                    <div className="stack" data-gap="5">
                      <div className={styles.memberFilters} role="group" aria-label="Filter members by role">
                        {ROLE_FILTERS.map((filter) => <Chip key={filter} selected={roleFilter === filter} onClick={() => selectRole(filter)}>
                          {filter === 'everyone' ? 'Everyone' : filter === 'player' ? 'Players' : 'DMs'}
                        </Chip>)}
                        {roleFilter === 'dm' ? <Chip selected={accepting} onClick={() => setAccepting(!accepting)}>Accepting players</Chip> : null}
                      </div>
                      <MemberList
                        members={members}
                        empty={roleFilter === 'dm' ? 'No DMs match.' : roleFilter === 'player' ? 'No players match.' : 'No members match.'}
                        profileBase={roleFilter === 'dm' ? '/dms' : roleFilter === 'player' ? '/players' : undefined}
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
                          {visibleCharacters.map((character) => {
                            const owner = character.ownerId ? allMembers.find((member) => member.memberId === character.ownerId) : undefined;
                            const ownerName = character.ownerId === null
                              ? 'Player not listed'
                              : owner ? labelForMember(owner) : 'Player profile unavailable';
                            return <CommunityCharacterCard
                              key={character.id}
                              character={character}
                              ownerName={ownerName}
                              regionName={characters.regionNames[character.regionId ?? '']}
                              regionNamesStatus={characters.regionNamesStatus}
                            />;
                          })}
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

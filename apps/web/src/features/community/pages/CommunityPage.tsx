import { useSizeClasses } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { WeekGrid, bucketFor } from '../../../components/primitives/WeekGrid.js';
import { useToast } from '../../../hooks/useToast.js';
import { useCommunityCharacters, useCommunityPage } from '../hooks/useCommunityPage.js';
import type { CommunityMemberView } from '../types.js';
import { characterStatusLabel, pluralize, weekdayList } from '../../../utils/format.js';
import styles from './community.module.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MemberList({
  members,
  empty,
  profileBase,
}: {
  members: CommunityMemberView[];
  empty: string;
  profileBase?: '/dms' | '/players';
}): React.JSX.Element {
  if (members.length === 0) {
    return <StatePanel status="empty" emptyMessage={empty} />;
  }
  return (
    <div className={styles.members}>
      {members.map((member) => (
        <Card
          key={member.memberId}
          variant="clickable"
          to={`${profileBase ?? (member.isDm ? '/dms' : '/players')}/@${member.handle}`}
          className={styles.member}
          pad={4}
        >
          <Avatar
            name={member.handle}
            src={member.avatarUrl ?? undefined}
            size="md"
            online={false}
          />
          <div className={styles.memberBody}>
            <div className={styles.memberHead}>
              <span className="type-title">@{member.handle}</span>
              {member.isDm && member.acceptingPlayers ? (
                <Chip size="sm" tone="accent">
                  Accepting
                </Chip>
              ) : null}
            </div>
            <span className="type-caption">
              {member.availableDays.length
                ? `Free ${weekdayList(member.availableDays, { plural: true })}`
                : 'No availability set'}
            </span>
            {member.tagline ? (
              <span className={`type-caption ${styles.tagline}`}>{member.tagline}</span>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CommunityPage(): React.JSX.Element {
  const page = useCommunityPage();
  const { widthClass } = useSizeClasses();
  const compact = widthClass === 'compact';
  const { addToast } = useToast();
  const characters = useCommunityCharacters();
  const hub =
    page.status === 'ready' ? page.view : { dms: [], players: [], memberCount: 0 };
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
  const available = members.filter((member) => member.availableDays.length > 0);

  return (
    <PageShell context="tavern" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="community">
        <header
          className="row"
          data-align="end"
          data-justify="between"
          data-wrap="1"
          data-gap="4"
        >
          <div className="stack" data-gap="2">
            <div className="type-label">The server · Players &amp; DMs</div>
            <h1 className="type-display">Community</h1>
            <p className="type-narrative">
              See who&apos;s free, find a table, and browse everyone on the server.
            </p>
          </div>
          {page.status === 'ready' ? (
            <span className="type-caption">{pluralize(hub.memberCount, 'member')}</span>
          ) : null}
        </header>
        {page.status === 'error' ? (
          <div className="stack" data-gap="3">
            <StatePanel status="error" error={page.error} />
            <button type="button" className={`btn ${styles.loadMore}`} onClick={page.retry}>
              Retry community
            </button>
          </div>
        ) : page.status === 'loading' ? (
          <StatePanel status="loading" />
        ) : (
          <Tabs
            className={styles.tabs}
            items={[
              {
                id: 'muster',
                label: `Muster · ${hub.memberCount}`,
                panel: (
                  <div className="stack" data-gap="5">
                    <Card pad={4} className="stack" data-gap="3">
                      <h2 className="type-label">Who's free this week</h2>
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
                          addToast(
                            free.length
                              ? `${day}: ${free.map((member) => `@${member.handle}`).join(', ')}`
                              : `${day}: no availability listed`,
                            'info',
                          );
                        }}
                        renderCell={(cell) => (
                          <div className={styles.day} data-empty={cell.count === 0}>
                            <span className="type-caption">{cell.date}</span>
                            {compact ? null : (
                              <div className={styles.dayAvatars}>
                                {(byDay.get(cell.date) ?? [])
                                  .slice(0, 3)
                                  .map((member) => (
                                    <Avatar
                                      key={member.memberId}
                                      name={member.handle}
                                      src={member.avatarUrl ?? undefined}
                                      size="xs"
                                      online={false}
                                    />
                                  ))}
                              </div>
                            )}
                            <span className="type-value">{cell.count || '–'}</span>
                          </div>
                        )}
                      />
                    </Card>
                    <Card pad={4} className={styles.findTable}>
                      <div className="stack" data-gap="1">
                        <h2 className="type-label">Find a table</h2>
                        <p className="type-body">
                          Browse open quests and available seats on the Tavern Board.
                        </p>
                      </div>
                      <Link className="btn btn--secondary" to="/quests">
                        Browse open quests →
                      </Link>
                    </Card>
                    <section className="stack" data-gap="3">
                      <div className="row" data-justify="between" data-align="center">
                        <h2 className="type-label">Available this week</h2>
                        <span className="type-caption">
                          {pluralize(available.length, 'member')}
                        </span>
                      </div>
                      <MemberList
                        members={available}
                        empty="No availability listed this week."
                      />
                    </section>
                  </div>
                ),
              },
              {
                id: 'dms',
                label: `DMs · ${hub.dms.length}`,
                panel: (
                  <MemberList
                    members={hub.dms}
                    empty="No DMs in the directory."
                    profileBase="/dms"
                  />
                ),
              },
              {
                id: 'players',
                label: `Players · ${hub.players.length}`,
                panel: (
                  <MemberList
                    members={hub.players}
                    empty="No players in the directory."
                    profileBase="/players"
                  />
                ),
              },
              {
                id: 'characters',
                label: `Characters · ${characters.data?.total ?? (characters.isError ? '—' : '…')}`,
                panel: characters.isError ? (
                  <StatePanel status="error" error={characters.error ?? undefined} />
                ) : characters.data ? (
                  <div className="stack" data-gap="4">
                    <div className={styles.members}>
                      {characters.data.items.map((character) => (
                        <Card
                          key={character.id}
                          variant="clickable"
                          to={`/characters/${character.shortCode}`}
                          className="stack"
                          pad={4}
                        >
                          <span className="type-code">{character.shortCode}</span>
                          <span className="type-title">{character.name}</span>
                          <span className="type-caption">
                            {characterStatusLabel(character.status)}
                          </span>
                        </Card>
                      ))}
                    </div>
                    {characters.data.items.length === 0 ? (
                      <StatePanel
                        status="empty"
                        emptyMessage="No characters in the roster."
                      />
                    ) : null}
                    {characters.hasMore ? (
                      <button
                        type="button"
                        className={`btn btn--secondary ${styles.loadMore}`}
                        disabled={characters.isFetching}
                        onClick={characters.loadMore}
                      >
                        Load more characters
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <StatePanel status="loading" />
                ),
              },
            ]}
          />
        )}
        <nav
          className="row"
          data-gap="3"
          data-wrap="1"
          aria-label="Community directories"
        >
          <Link className="btn btn--ghost btn--sm" to="/dms">
            DM directory →
          </Link>
          <Link className="btn btn--ghost btn--sm" to="/players">
            Player directory →
          </Link>
          <Link className="btn btn--ghost btn--sm" to="/characters">
            Character roster →
          </Link>
        </nav>
      </SingleRegionPage>
    </PageShell>
  );
}

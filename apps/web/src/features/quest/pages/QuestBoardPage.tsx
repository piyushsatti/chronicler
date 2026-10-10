import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import {
  useQuestBoardPage,
  type BoardSegment,
} from '../hooks/useQuestBoardPage.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-board',
  regions: [{ role: 'body', priority: 1 }],
};

const SEGMENTS: BoardSegment[] = ['Open', 'Scheduled', 'Live', 'All'];

function BoardFilters({
  segment,
  setSegment,
  myFriends,
  setMyFriends,
}: {
  segment: BoardSegment;
  setSegment: (segment: BoardSegment) => void;
  myFriends: boolean;
  setMyFriends: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Quest board filters">
        {SEGMENTS.map((label) => (
          <button
            key={label}
            type="button"
            className="btn"
            role="tab"
            aria-selected={segment === label}
            data-active={segment === label ? 'true' : undefined}
            onClick={() => setSegment(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          aria-pressed={myFriends}
          onClick={() => setMyFriends(!myFriends)}
        >
          My friends
        </button>
        {myFriends ? (
          <p className="type-caption">Friend filtering is not wired on the board yet.</p>
        ) : null}
      </div>
    </div>
  );
}

export function QuestBoardPage(): React.JSX.Element {
  const page = useQuestBoardPage();

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    regions = {
      body: () => (
        <div className="stack">
          <header className="stack">
            <p className="eyebrow">The Tavern Board</p>
            <h1 className="type-heading">Quests</h1>
            <BoardFilters
              segment={page.segment}
              setSegment={page.setSegment}
              myFriends={page.myFriends}
              setMyFriends={page.setMyFriends}
            />
          </header>
          {page.status === 'empty' ? (
            <StatePanel status="empty" emptyMessage="No quests in this lane." />
          ) : (
            <ul className="stack">
              {page.view.map((q) => (
                <li key={q.id}>
                  <QuestCard quest={q} />
                  <Link className="type-caption" to={`/quests/${q.shortCode}/summary`}>
                    Session summaries
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    };
  }

  return (
    <PageShell title="Quests">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}

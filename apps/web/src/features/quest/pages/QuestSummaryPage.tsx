import { useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { useQuestSummaryPage } from '../hooks/useQuestSummaryPage.js';
import { statusLabel } from '../../../utils/format.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import styles from './questSummary.module.css';

const DECLARATION: PageDeclaration = {
  page: 'quest-summary',
  regions: [{ role: 'body', priority: 1 }],
};
export function QuestSummaryPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useQuestSummaryPage(code);
  const [characterId, setCharacterId] = useState('');
  let regions: PageRegionRenderers;
  if (page.status === 'error')
    regions = {
      body: () => (
        <div className="stack">
          <StatePanel status="error" error={page.error} />
          <Button onClick={page.retry} pending={page.fetching}>
            Try again
          </Button>
        </div>
      ),
    };
  else if (page.status === 'loading')
    regions = { body: () => <StatePanel status="loading" /> };
  else {
    const { quest, documents, totals } = page.view;
    const own = quest.participants.filter(
      (participant) =>
        participant.memberId === page.memberId && participant.status !== 'withdrawn',
    );
    const href = `/summaries/new?questId=${encodeURIComponent(quest.id)}`;
    const pcxpKnown = totals.coverage !== 'LEGACY_UNKNOWN';
    regions = {
      body: () => (
        <article className={`stack ${styles.page}`} data-gap="6">
          <header className="stack" data-gap="2">
            <Link
              className="type-caption"
              to={`/quests/${encodeURIComponent(quest.shortCode)}`}
            >
              ← Quest detail
            </Link>
            <p className="eyebrow">{quest.shortCode} · Summary</p>
            <h1 className="type-display">{quest.title}</h1>
            <div className="row" data-wrap="1" data-gap="2" data-align="center">
              <Chip size="sm" tone="status">
                {statusLabel(quest.status)}
              </Chip>
              {quest.dmName ? (
                <span className="type-caption">Run by {quest.dmName}</span>
              ) : null}
            </div>
          </header>
          <div className={styles.stats}>
            <StatTile
              size="sm"
              label="PCXP awarded"
              value={pcxpKnown ? (totals.totalPcxpAwarded ?? 0) : 'Unknown'}
              tone={
                pcxpKnown && (totals.totalPcxpAwarded ?? 0) > 0 ? 'accent' : 'neutral'
              }
              hint={
                pcxpKnown
                  ? 'Across this session'
                  : 'Historical attribution was not recorded'
              }
            />
            <StatTile
              size="sm"
              label="Summaries"
              value={documents.length}
              hint="Linked to this quest"
            />
          </div>
          {page.canWriteDM || own.length ? (
            <section className="stack" data-gap="3" aria-label="Write a summary">
              {page.canWriteDM ? (
                <div className="row" data-wrap="1">
                  <Link className="btn btn--primary" to={href}>
                    Write a DM summary
                  </Link>
                </div>
              ) : null}
              {own.length ? (
                <div className="row" data-wrap="1" data-gap="3" data-align="end">
                  <label className="stack" data-gap="1">
                    <span className="type-label">Summary character</span>
                    <select
                      className="field-input"
                      aria-label="Summary character"
                      value={characterId}
                      onChange={(event) => setCharacterId(event.target.value)}
                    >
                      <option value="">Choose your participating character</option>
                      {own.map((participant) => (
                        <option
                          key={participant.characterId}
                          value={participant.characterId}
                        >
                          {participant.characterName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {own.some(
                    (participant) => participant.characterId === characterId,
                  ) ? (
                    <Link
                      className="btn btn--secondary"
                      to={`${href}&characterId=${encodeURIComponent(characterId)}`}
                    >
                      Write a character summary
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          <section className="stack" data-gap="3" aria-label="Linked summaries">
            <h2 className="type-title">Session summaries</h2>
            {!documents.length ? (
              <p className={`type-body ${styles.empty}`}>
                No summaries are linked to this quest yet.
                {page.canWriteDM || own.length
                  ? ' Write one above and it will appear here.'
                  : ' They appear here once the DM or players write them.'}
              </p>
            ) : (
              <ul className={styles.list}>
                {documents.map((document) => (
                  <li key={document.id} className="card stack" data-gap="2">
                    <div
                      className="row"
                      data-wrap="1"
                      data-justify="between"
                      data-gap="2"
                    >
                      <Link
                        className="type-title"
                        to={`/chronicles/${encodeURIComponent(document.slug)}`}
                      >
                        {document.title}
                      </Link>
                      <Chip size="sm" tone="line">
                        {statusLabel(document.status)}
                      </Chip>
                    </div>
                    {document.effectiveBody ? (
                      <ContentRenderer body={document.effectiveBody} />
                    ) : null}
                    {document.canEditMetadata ? (
                      <div className="row">
                        <Link
                          className="btn btn--ghost btn--sm"
                          to={`/summaries/${encodeURIComponent(document.id)}/edit`}
                        >
                          Edit summary
                        </Link>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      ),
    };
  }
  return (
    <PageShell>
      <div className="ctx-chronicle">
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}

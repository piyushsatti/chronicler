import { useId, useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { useQuestSummaryPage } from '../hooks/useQuestSummaryPage.js';
import { personLabels, statusLabel } from '../../../utils/format.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { Select } from '../../../components/primitives/Select.js';
import styles from './questSummary.module.css';

const DECLARATION: PageDeclaration = {
  page: 'quest-summary',
  regions: [{ role: 'body', priority: 1 }],
};
export function QuestSummaryPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useQuestSummaryPage(code);
  const [characterId, setCharacterId] = useState('');
  const characterLabelId = useId();
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
    const canWrite = page.canWriteDM || own.length > 0;
    const showStats =
      documents.length > 0 || !pcxpKnown || (totals.totalPcxpAwarded ?? 0) > 0;
    regions = {
      body: () => (
        <article className={`stack ${styles.page}`} data-gap="6">
          <PageHeader
            back={{
              to: `/quests/${encodeURIComponent(quest.shortCode)}`,
              label: quest.title,
            }}
            title="Session summaries"
            meta={
              quest.dmName ? (
                <span>
                  Run by{' '}
                  {personLabels([{ displayName: quest.dmName, handle: quest.dmHandle }])[0]}
                </span>
              ) : null
            }
          />
          {showStats ? (
          <CardGrid gap={3}>
            <StatTile
              size="sm"
              label="XP awarded"
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
          </CardGrid>
          ) : null}
          {canWrite && (documents.length > 0 || own.length > 0) ? (
            <section className="stack" data-gap="3" aria-label="Write a summary">
              {page.canWriteDM && documents.length > 0 ? (
                <div className="row" data-wrap="1">
                  <Link className="btn btn--primary" to={href}>
                    Write a DM summary
                  </Link>
                </div>
              ) : null}
              {own.length ? (
                <div className="row" data-wrap="1" data-gap="3" data-align="end">
                  <div className="stack" data-gap="1">
                    <span className="type-label" id={characterLabelId}>Summary character</span>
                    <Select
                      label="Summary character"
                      labelId={characterLabelId}
                      value={characterId}
                      onValueChange={setCharacterId}
                      options={[
                        { value: '', label: 'Choose your participating character' },
                        ...own.map((participant) => ({ value: participant.characterId, label: participant.characterName })),
                      ]}
                    />
                  </div>
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
            {!documents.length ? (
              <EmptyState
                kind="timeline-empty"
                message="No session summaries have been written for this quest yet."
                action={
                  page.canWriteDM ? (
                    <Link className="btn btn--primary btn--sm" to={href}>
                      Write a DM summary
                    </Link>
                  ) : null
                }
              />
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
                          Edit entry
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

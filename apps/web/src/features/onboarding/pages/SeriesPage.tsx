import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { seriesNameError, useSeriesPage } from '../../../hooks/useSeriesPage.js';
import { isSentinelDate, personLabels, pluralize } from '../../../utils/format.js';
import { toCardStatus } from '../../../view-models/questCard.js';
import { hasSeat } from '../../../utils/questVocabulary.js';
import styles from './seriesPage.module.css';

/** The quest create form with this series pre-selected. */
function newQuestHref(arcId: string): string {
  return `/quests/new?series=${encodeURIComponent(arcId)}`;
}

export function SeriesPage(): React.JSX.Element {
  const { shortCode = '' } = useParams();
  const page = useSeriesPage(shortCode);
  const dates = useDateFormatter();
  const [renaming, setRenaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const arc = !page.arc.isError ? page.arc.data : undefined;
  const dms = [
    ...new Map(
      arc?.quests.flatMap((quest) =>
        quest.dm
          ? [[quest.dm.handle.trim().replace(/^@/, '').toLowerCase(), quest.dm] as const]
          : [],
      ),
    ).values(),
  ];
  const dmLabels = personLabels(dms);
  const labels = new Map(
    dms.map((dm, index) => [dm.handle.trim().replace(/^@/, '').toLowerCase(), dmLabels[index]]),
  );
  const next = arc?.quests
    .filter(
      (quest) =>
        !isSentinelDate(quest.scheduledAt) &&
        Date.parse(quest.scheduledAt) >= Date.now() &&
        !['closed', 'cancelled'].includes(
          toCardStatus(quest.displayStatus, quest.status),
        ),
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
  const backAction = (
    <Link className="btn btn--primary" to="/quests">
      Back to quests
    </Link>
  );
  return (
    <PageShell context="war-room">
      <SingleRegionPage page="series">
        <div className="stack" data-gap="5">
          <PageHeader
            back={{ to: '/quests', label: 'Quests' }}
            title={arc?.name ?? 'Quest series'}
            meta={
              arc ? (
                <>
                  <span>{pluralize(arc.questCount, 'quest')}</span>
                  <span className="stack" data-gap="1">
                    {dmLabels.length ? <span>With {dmLabels.join(', ')}</span> : null}
                    {next ? (
                      <span>Next session {dates.formatScheduled(next.scheduledAt)}</span>
                    ) : null}
                  </span>
                </>
              ) : undefined
            }
            actions={
              page.canRename || (page.canAddQuest && arc) ? (
                <>
                  {page.canAddQuest && arc ? (
                    <Link className="btn btn--primary" to={newQuestHref(arc.id)}>
                      New quest in this series
                    </Link>
                  ) : null}
                  {page.canRename ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setNameError(null);
                        setRenaming(true);
                      }}
                    >
                      Rename series
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          />
          <DetailLayout>
            {!page.validId ? (
              <StatePanel
                status="empty"
                title="Series not found"
                emptyMessage="This series link is out of date. Open a series from its quest on the board."
                action={backAction}
              />
            ) : page.arc.isError ? (
              <StatePanel
                status="error"
                error={toAppError(page.arc.error, 'series:read')}
                onRetry={page.retry}
                action={backAction}
              />
            ) : page.arc.isPending ? (
              <StatePanel status="loading" />
            ) : !arc ? (
              <StatePanel
                status="empty"
                title="Series not found"
                emptyMessage="This quest series is unavailable."
                action={backAction}
              />
            ) : arc.quests.length ? (
              <CardGrid as="ol" aria-label="Quests in this series" gap={5}>
                {arc.quests.map((quest) => (
                  <li key={quest.id} className={styles.cardItem}>
                    <QuestCard
                      code={quest.shortCode}
                      title={quest.briefDocument?.title ?? 'Untitled quest'}
                      description={quest.briefDocument?.effectiveBody}
                      status={toCardStatus(quest.displayStatus, quest.status)}
                      when={dates.formatScheduled(quest.scheduledAt)}
                      whenShort={dates.formatScheduledShort(quest.scheduledAt)}
                      dmUsername={quest.dm?.handle}
                      dmName={
                        quest.dm
                          ? labels.get(quest.dm.handle.trim().replace(/^@/, '').toLowerCase())
                          : undefined
                      }
                      totalSlots={quest.slotsMax}
                      party={quest.participants
                        .filter((member) => hasSeat(member.status))
                        .map((member) => ({
                          characterId: member.characterId,
                          characterName: member.characterName,
                          avatarUrl: member.memberAvatarUrl,
                        }))}
                      waitlistCount={
                        quest.participants.filter(
                          (member) => member.status === 'waitlisted',
                        ).length
                      }
                    />
                  </li>
                ))}
              </CardGrid>
            ) : (
              <EmptyState
                message="No quests belong to this series yet."
                action={
                  page.canAddQuest ? (
                    <Link className="btn btn--primary btn--sm" to={newQuestHref(arc.id)}>
                      New quest in this series
                    </Link>
                  ) : (
                    <Link className="btn btn--secondary btn--sm" to="/quests">
                      Browse the quest board
                    </Link>
                  )
                }
              />
            )}
          </DetailLayout>
          {arc ? (
            <Modal
              open={renaming && page.canRename}
              title="Rename series"
              onClose={() => setRenaming(false)}
              size="sm"
            >
              <form
                key={arc.name}
                className="stack"
                data-gap="4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get('name') ?? '');
                  const invalid = seriesNameError(name);
                  setNameError(invalid);
                  if (!invalid) void page.save(arc.id, name, () => setRenaming(false));
                }}
              >
                <Field
                  label="Series name"
                  name="name"
                  required
                  defaultValue={arc.name}
                  error={nameError ?? undefined}
                  onChange={() => setNameError(null)}
                />
                {page.error ? <StatePanel status="error" error={page.error} /> : null}
                <div className="row" data-gap="3" data-wrap="1">
                  <Button type="submit" pending={page.pending}>
                    Save series name
                  </Button>
                  <Button variant="ghost" onClick={() => setRenaming(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Modal>
          ) : null}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

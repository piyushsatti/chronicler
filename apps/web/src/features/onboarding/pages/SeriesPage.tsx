import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useSeriesPage } from '../hooks/useSeriesPage.js';
import { pluralize, statusLabel } from '../../../utils/format.js';
import styles from './series.module.css';

export function SeriesPage(): React.JSX.Element {
  const { shortCode = '' } = useParams();
  const page = useSeriesPage(shortCode);
  const dates = useDateFormatter();
  const arc = !page.arc.isError ? page.arc.data : undefined;
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
                  <span>Created {dates.formatDate(arc.createdAt)}</span>
                </>
              ) : undefined
            }
          />
          {!page.validId ? (
            <p className="type-body">
              This historical series code has no current UUID identity. Open a series
              from its quest’s arc link to continue.
            </p>
          ) : page.arc.isError ? (
            <>
              <StatePanel
                status="error"
                error={toAppError(page.arc.error, 'series:read')}
              />
              <Button onClick={page.retry}>Try again</Button>
            </>
          ) : page.arc.isPending ? (
            <StatePanel status="loading" />
          ) : !arc ? (
            <StatePanel
              status="empty"
              title="Series not found"
              emptyMessage="This quest series is unavailable."
              action={
                <Link className="btn" to="/quests">
                  Back to Quests
                </Link>
              }
            />
          ) : (
            <>
              {arc.quests.length ? (
                <ol className={styles.quests}>
                  {arc.quests.map((quest) => (
                    <li key={quest.id}>
                      <Link
                        className={styles.quest}
                        to={`/quests/${encodeURIComponent(quest.shortCode)}`}
                      >
                        <span className="stack" data-gap="1">
                          <span className="type-title">
                            {quest.briefDocument?.title ?? quest.shortCode}
                          </span>
                          <span className="type-caption">
                            {dates.formatScheduled(quest.scheduledAt)}
                          </span>
                        </span>
                        <Chip size="sm" tone="line">
                          {statusLabel(quest.status)}
                        </Chip>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  message="No quests belong to this series yet."
                  action={
                    <Link className="btn btn--secondary btn--sm" to="/quests">
                      Browse the quest board
                    </Link>
                  }
                />
              )}
              {page.canRename ? (
                <form
                  key={arc.name}
                  className={`card stack ${styles.form}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void page.save(arc.id, String(data.get('name') ?? ''));
                  }}
                >
                  <h2 className="type-title">Edit series name</h2>
                  <div className={styles.inline}>
                    <Field
                      label="Series name"
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={arc.name}
                    />
                    <Button type="submit" variant="secondary" pending={page.pending}>
                      Save series name
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          )}
          {page.authorityError ? (
            <>
              <StatePanel status="error" error={page.authorityError} />
              <Button onClick={page.retryAuthority}>Retry permissions</Button>
            </>
          ) : null}
          {page.canCreate ? (
            <form
              className={`card stack ${styles.form}`}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void page.save(null, String(data.get('name') ?? ''), () =>
                  form.reset(),
                );
              }}
            >
              <h2 className="type-title">Create a quest series</h2>
              <div className={styles.inline}>
                <Field label="New series name" name="name" required maxLength={200} />
                <Button type="submit" variant="secondary" pending={page.pending}>
                  Create series
                </Button>
              </div>
            </form>
          ) : null}
          {page.error ? <StatePanel status="error" error={page.error} /> : null}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

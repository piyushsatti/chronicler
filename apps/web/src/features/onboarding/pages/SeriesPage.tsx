import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
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
    <PageShell title={arc?.name ?? 'Quest series'} context="war-room">
      <SingleRegionPage page="series">
        <div className="stack" data-gap="5">
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
              emptyMessage="This quest series is unavailable."
            />
          ) : (
            <>
              <p className="type-caption">
                {pluralize(arc.questCount, 'quest')} · Created{' '}
                {dates.formatDate(arc.createdAt)}
              </p>
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
                <StatePanel
                  status="empty"
                  emptyMessage="No quests belong to this series yet."
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
          <Link className="type-link" to="/quests">
            Browse quests
          </Link>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

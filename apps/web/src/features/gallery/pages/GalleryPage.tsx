import { Link } from 'react-router-dom';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { GALLERY_ENTRIES, GALLERY_SECTIONS } from '../entries/index.js';
import styles from './gallery.module.css';

function GalleryGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const access = useCurrentAccess('admin');
  // Non-ready states get the same container but no Gallery title, so a
  // denied member never sees the surface name as a page heading.
  if (access.status === 'error')
    return (
      <PageShell>
        <StatePanel status="error" error={access.error ?? undefined} />
        <Button onClick={access.reload}>Retry staff access</Button>
      </PageShell>
    );
  if (access.status === 'loading')
    return (
      <PageShell>
        <StatePanel status="loading" />
      </PageShell>
    );
  if (!access.allowed)
    return (
      <PageShell>
        <StatePanel
          status="denied"
          deniedMessage="This design surface requires staff access."
          onRetry={access.reload}
          retryLabel="Retry staff access"
        />
      </PageShell>
    );
  return <>{children}</>;
}

function GalleryTree(): React.JSX.Element {
  return (
    <Tabs
      items={GALLERY_SECTIONS.map((section) => {
        const entries = GALLERY_ENTRIES.filter((entry) => entry.section === section.id);
        return {
          id: section.id,
          label: section.title,
          panel: (
            <div className="stack" data-gap="5">
              <nav aria-label={`${section.title} entries`}>
                <ul className={styles.jump}>
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <a className="chip" data-size="sm" href={`#gallery-${entry.id}`}>
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <ul className="stack" aria-label={section.title}>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <Card
                      className={`stack ${styles.entry}`}
                      id={`gallery-${entry.id}`}
                    >
                      <h2 className="type-heading">{entry.title}</h2>
                      <div className={styles.demo} data-el={`gallery.demo.${entry.id}`}>
                        {entry.render()}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          ),
        };
      })}
    />
  );
}

export function GalleryPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <GalleryGate>
        <PageShell eyebrow="Design QA" title="Gallery">
          <SingleRegionPage page="gallery">
            <p className="type-body">
              Admin-only design surface. Entry demos mirror the legacy gallery tree.
            </p>
            <GalleryTree />
            <Link className="type-link" to="/">
              Return home
            </Link>
          </SingleRegionPage>
        </PageShell>
      </GalleryGate>
    </ProtectedRoute>
  );
}

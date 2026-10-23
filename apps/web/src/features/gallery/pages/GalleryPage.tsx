import { Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { GALLERY_ENTRIES, GALLERY_SECTIONS } from '../entries/index.js';
import styles from './gallery.module.css';

function GalleryGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const access = useCurrentAccess('admin');
  // Non-ready states get the frame and the page title, so a denied member
  // sees the same surface as every other staff-only page.
  if (access.status === 'error')
    return (
      <PageShell title="Staff only" back={{ to: '/', label: 'Home' }}>
        <StatePanel
          status="error"
          error={access.error ?? undefined}
          onRetry={access.reload}
          retryLabel="Reload account"
        />
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
      <PageShell title="Staff only" back={{ to: '/', label: 'Home' }}>
        <StatePanel
          status="denied"
          title="Staff only"
          deniedMessage="The gallery is for staff."
          onRetry={access.reload}
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
  // A developer reference: production builds do not serve it to anyone.
  if (!import.meta.env.DEV) return <Navigate to="/404" replace />;
  return (
    <ProtectedRoute>
      <GalleryGate>
        <PageShell>
          <SingleRegionPage page="gallery">
            <PageHeader
              title="Gallery"
              lede="Developer reference for staff: every shared component and pattern, with its states."
            />
            <GalleryTree />
          </SingleRegionPage>
        </PageShell>
      </GalleryGate>
    </ProtectedRoute>
  );
}

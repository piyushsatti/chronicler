import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Select } from '../../../components/primitives/Select.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { pluralize } from '../../../utils/format.js';
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

function GallerySection({
  section,
}: {
  section: (typeof GALLERY_SECTIONS)[number];
}): React.JSX.Element {
  const [example, setExample] = useState('all');
  const entries = GALLERY_ENTRIES.filter((entry) => entry.section === section.id);
  const visible = entries.filter((entry) => example === 'all' || entry.id === example);
  const total = pluralize(entries.length, 'example');
  return (
    <div className="stack" data-gap="5">
      <FilterBar
        label={`${section.title} reference`}
        count={example === 'all' ? total : `1 of ${total}`}
      >
        <div className={styles.index}>
          <span className="type-label" id={`gallery-${section.id}-picker`}>Show example</span>
          <Select
            label="Show example"
            labelId={`gallery-${section.id}-picker`}
            value={example}
            options={[
              { value: 'all', label: 'All examples' },
              ...entries.map((entry) => ({ value: entry.id, label: entry.title })),
            ]}
            onValueChange={setExample}
          />
        </div>
      </FilterBar>
      <details className={styles.jumpLinks}>
        <summary className="type-caption">Jump to example</summary>
        <nav className="row" data-wrap="1" data-gap="2" aria-label={`${section.title} example links`}>
          {visible.map((entry) => (
            <a key={entry.id} className="type-caption" href={`#gallery-${entry.id}`}>
              {entry.title}
            </a>
          ))}
        </nav>
      </details>
      <CardGrid as="ul" aria-label={`${section.title} examples`}>
        {visible.map((entry) => (
          <li key={entry.id} className={styles.item} data-layout={entry.layout}>
            <Card
              className={`stack ${styles.entry}`}
              id={`gallery-${entry.id}`}
              as="section"
              aria-label={`${entry.title} example`}
            >
              <PageHeader title={entry.title} level={2} className={styles.entryHeader} />
              <div className={styles.preview}>
                <p className="type-label">Example</p>
                <div className={styles.demo} data-el={`gallery.demo.${entry.id}`}>
                  {entry.render()}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </CardGrid>
    </div>
  );
}

function GalleryTree(): React.JSX.Element {
  return (
    <Tabs
      aria-label="Gallery sections"
      items={GALLERY_SECTIONS.map((section) => ({
        id: section.id,
        label: section.title,
        panel: <GallerySection key={section.id} section={section} />,
      }))}
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

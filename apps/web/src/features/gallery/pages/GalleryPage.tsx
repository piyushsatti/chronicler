import { Link, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { isAdmin } from '../../../utils/permissions.js';
import { useMe } from '../../../hooks/useMe.js';
import { Card } from '../../../components/primitives/Card.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { GALLERY_ENTRIES, GALLERY_SECTIONS } from '../entries/index.js';

function GalleryGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const me = useMe();
  if (me.isLoading) return <p className="state-loading">Loading…</p>;
  if (!isAdmin(me.data?.roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GalleryTree(): React.JSX.Element {
  return (
    <Tabs
      items={GALLERY_SECTIONS.map((section) => ({
        id: section.id,
        label: section.title,
        panel: (
          <ul className="stack" aria-label={section.title}>
            {GALLERY_ENTRIES.filter((entry) => entry.section === section.id).map((entry) => (
              <li key={entry.id}>
                <Card className="stack" id={`gallery-${entry.id}`}>
                  <h2 className="type-heading">{entry.title}</h2>
                  <p className="type-caption">Entry id: {entry.id}</p>
                  <div data-el={`gallery.demo.${entry.id}`}>{entry.render()}</div>
                </Card>
              </li>
            ))}
          </ul>
        ),
      }))}
    />
  );
}

export function GalleryPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <GalleryGate>
        <SingleRegionPage page="gallery">
          <p className="eyebrow">Design QA</p>
          <h1 className="type-display">Gallery</h1>
          <p className="type-body">
            Admin-only design surface. Entry demos mirror the legacy gallery tree.
          </p>
          <GalleryTree />
          <Link className="type-link" to="/">
            Return home
          </Link>
        </SingleRegionPage>
      </GalleryGate>
    </ProtectedRoute>
  );
}

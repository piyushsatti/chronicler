import { lazy, Suspense } from 'react';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';

const CharacterVerifyConnected = lazy(async () => {
  const { useCharacterVerifyTab } = await import('../hooks/useCharacterVerifyTab.js');
  const { CharacterVerifyTab } = await import('../components/CharacterVerifyTab.js');
  function Connected(): React.JSX.Element {
    return <CharacterVerifyTab view={useCharacterVerifyTab()} />;
  }
  return { default: Connected };
});
const DmProfileVerifyConnected = lazy(async () => {
  const { useDmProfileVerifyTab } = await import('../hooks/useDmProfileVerifyTab.js');
  const { DmProfileVerifyTab } = await import('../components/DmProfileVerifyTab.js');
  function Connected(): React.JSX.Element {
    return <DmProfileVerifyTab view={useDmProfileVerifyTab()} />;
  }
  return { default: Connected };
});

export function AdminReviewPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-review" title="Review" authority="review">
      <section
        className="admin-workspace-section stack"
        aria-labelledby="admin-review-title"
      >
        <div className="stack">
          <span className="type-label">Review queue</span>
          <h2 id="admin-review-title" className="type-heading">
            Verification decisions
          </h2>
          <p className="type-caption">
            Approve records or send an explicit, owner-visible change request.
          </p>
        </div>
        <Tabs
          items={[
            {
              id: 'character',
              label: 'Characters',
              panel: (
                <Suspense
                  fallback={<p className="type-caption">Loading review queue…</p>}
                >
                  <CharacterVerifyConnected />
                </Suspense>
              ),
            },
            {
              id: 'dm-profile',
              label: 'DM Profiles',
              panel: (
                <Suspense
                  fallback={<p className="type-caption">Loading review queue…</p>}
                >
                  <DmProfileVerifyConnected />
                </Suspense>
              ),
            },
          ]}
        />
      </section>
    </AdminWorkspaceShell>
  );
}

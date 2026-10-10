import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadCharacterProgression } from '../adapters/progressionAdapter.js';
import { useCharacterPage } from '../hooks/useCharacterPage.js';

const DECLARATION: PageDeclaration = {
  page: 'character',
  regions: [
    { role: 'profile', priority: 1 },
    { role: 'progression', priority: 2 },
  ],
};

export function CharacterPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useCharacterPage(code);
  const characterId = page.status === 'ready' ? page.view.id : '';
  const progression = useQuery({
    queryKey: queryKeys.characterProgression(characterId),
    queryFn: () => loadCharacterProgression(characterId),
    enabled: Boolean(characterId),
  });

  if (page.status === 'error') {
    return (
      <PageShell title="Character">
        <StatePanel status="error" error={page.error} />
      </PageShell>
    );
  }
  if (page.status === 'loading' || page.status === 'empty') {
    return (
      <PageShell title="Character">
        <StatePanel
          status={page.status === 'empty' ? 'empty' : 'loading'}
          emptyMessage="Character not found."
        />
      </PageShell>
    );
  }

  const c = page.view;
  const regions: PageRegionRenderers = {
    profile: () => (
      <div className="stack">
        <p className="type-caption">{c.shortCode}</p>
        <section className="card stack" aria-labelledby="backstory-heading">
          <h2 id="backstory-heading" className="type-heading">
            Backstory
          </h2>
          <p className="type-body">
            {c.backstoryName ?? 'Unknown backstory'}
          </p>
        </section>
        {c.description ? (
          <section className="card stack">
            <h2 className="type-heading">Description</h2>
            <p className="type-body">{c.description}</p>
          </section>
        ) : null}
        {c.ddbUrl ? (
          <p>
            <a className="btn" href={c.ddbUrl} rel="noreferrer" target="_blank">
              D&amp;D Beyond
            </a>
          </p>
        ) : null}
      </div>
    ),
    progression: () => {
      if (progression.isError) {
        return (
          <StatePanel
            status="error"
            error={toAppError(progression.error, 'character:progression')}
          />
        );
      }
      if (progression.isLoading || !progression.data) {
        return <StatePanel status="loading" />;
      }
      if (progression.data.length === 0) {
        return (
          <StatePanel status="empty" emptyMessage="No progression entries." />
        );
      }
      return (
        <section className="card stack" aria-label="Progression">
          <h2 className="type-heading">Progression</h2>
          <ul className="stack">
            {progression.data.map((e, i) => (
              <li key={`${e.amount}-${i}`}>
                <span className="type-title">+{e.amount} PCXP</span>
                {e.note ? <p className="type-caption">{e.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };

  return (
    <PageShell title={c.name}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}

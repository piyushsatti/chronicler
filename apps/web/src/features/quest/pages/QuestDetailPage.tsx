import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { isDm } from '../../../auth/roles.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Button } from '../../../components/primitives/Button.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import { useQuestMutations } from '../hooks/useQuestMutations.js';
import { useQuestPage } from '../hooks/useQuestPage.js';
import { useSignupCharacter } from '../hooks/useSignupCharacter.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-detail',
  regions: [
    { role: 'summary', priority: 1 },
    { role: 'roster', priority: 2 },
  ],
};

export function QuestDetailPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useQuestPage(code);
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const dm = me.data ? isDm(me.data.roles) : false;
  const questId = page.status === 'ready' ? page.view.id : '';
  const shortCode = page.status === 'ready' ? page.view.shortCode : code;
  const mutations = useQuestMutations(shortCode, questId);
  const signupChar = useSignupCharacter(isAuthenticated);
  const firstCharacterId = signupChar.data ?? undefined;

  if (page.status === 'error') {
    return (
      <PageShell title="Quest">
        <StatePanel status="error" error={page.error} />
      </PageShell>
    );
  }
  if (page.status === 'loading' || page.status === 'empty') {
    return (
      <PageShell title="Quest">
        <StatePanel status="loading" />
      </PageShell>
    );
  }

  const quest = page.view;
  const mutationError =
    mutations.signup.error ?? mutations.transition.error ?? mutations.close.error;

  const regions: PageRegionRenderers = {
    summary: () => (
      <div className="stack">
        <p className="type-caption">{quest.shortCode}</p>
        <p className="type-body">Status: {quest.status}</p>
        <p className="type-caption">
          {quest.filledCount}/{quest.slotsMax} seats · {quest.durationHours}h
        </p>
        {quest.dmName ? <p className="type-caption">DM {quest.dmName}</p> : null}
        <p className="type-caption">
          Discord delivery: {quest.discordDelivery.overallStatus}
          {!quest.discordDelivery.isTerminal
            ? ` (${quest.discordDelivery.appliedRevision}/${quest.discordDelivery.desiredRevision})`
            : ''}
        </p>
        <Link className="type-link" to={`/quests/${quest.shortCode}/summary`}>
          Session summaries
        </Link>
        {isAuthenticated ? (
          <Button
            type="button"
            disabled={mutations.signup.isPending || !firstCharacterId}
            onClick={() => {
              if (firstCharacterId) mutations.signup.mutate(firstCharacterId);
            }}
          >
            Sign up
          </Button>
        ) : null}
        {dm ? (
          <div className="row">
            <Button
              type="button"
              variant="ghost"
              disabled={mutations.transition.isPending}
              onClick={() => mutations.transition.mutate('played')}
            >
              Mark played
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={mutations.close.isPending}
              onClick={() => mutations.close.mutate()}
            >
              Close
            </Button>
          </div>
        ) : null}
        {mutationError ? (
          <StatePanel
            status="error"
            error={toAppError(mutationError, 'quest:mutation')}
          />
        ) : null}
      </div>
    ),
    roster: () => (
      <Tabs
        items={[
          {
            id: 'roster',
            label: 'Roster',
            panel: (
              <section className="stack" aria-label="Roster">
                {quest.participants.length === 0 ? (
                  <p className="type-caption">No participants yet.</p>
                ) : (
                  <ul className="stack">
                    {quest.participants.map((p) => (
                      <li key={`${p.memberId}-${p.characterId}`}>
                        <span className="type-title">{p.characterName}</span>
                        <p className="type-caption">
                          @{p.memberHandle} · {p.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ),
          },
          {
            id: 'details',
            label: 'Details',
            panel: (
              <section className="stack" aria-label="Details">
                <p className="type-caption">
                  Genres: {quest.genres.length > 0 ? quest.genres.join(', ') : '—'}
                </p>
                <p className="type-caption">
                  Tags: {quest.tags.length > 0 ? quest.tags.join(', ') : '—'}
                </p>
                <p className="type-caption">Scheduled: {quest.scheduledAt}</p>
              </section>
            ),
          },
        ]}
      />
    ),
  };

  return (
    <PageShell title={quest.title}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}

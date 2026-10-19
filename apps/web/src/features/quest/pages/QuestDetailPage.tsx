import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { isDm } from '../../../auth/roles.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import {
  StatusBadge,
  type QuestState,
  type Status,
} from '../../../components/foundation/StatusBadge.js';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import { DiscordDeliveryStatus } from '../components/DiscordDeliveryStatus.js';
import { useQuestMutations } from '../hooks/useQuestMutations.js';
import { useQuestPage } from '../hooks/useQuestPage.js';
import { useSignupCharacter } from '../hooks/useSignupCharacter.js';
import styles from './questDetail.module.css';

const DECLARATION: PageDeclaration = {
  page: 'quest-detail',
  regions: [
    { role: 'summary', priority: 1 },
    { role: 'roster', priority: 2 },
  ],
};

const QUEST_STATES = new Set<string>([
  'completed',
  'closed',
  'open',
  'full',
  'scheduled',
  'filling',
  'live',
  'cancelled',
]);

function emptyRegion(): React.JSX.Element {
  return <div hidden />;
}

function questBadgeStatus(status: string): Status | null {
  const key = status.toLowerCase();
  return QUEST_STATES.has(key) ? (key as QuestState) : null;
}

function canMutateStatus(machineStatus: string): boolean {
  const key = machineStatus.toLowerCase();
  return key === 'open' || key === 'full';
}

function formatSchedule(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function SignupActions({
  isAuthenticated,
  characterId,
  characterStatus,
  characterError,
  signupPending,
  signupError,
  onSignup,
}: {
  isAuthenticated: boolean;
  characterId: string | undefined;
  characterStatus: 'idle' | 'loading' | 'error' | 'empty' | 'ready';
  characterError?: AppError;
  signupPending: boolean;
  signupError: unknown;
  onSignup: (characterId: string) => void;
}): React.JSX.Element {
  if (!isAuthenticated) {
    return (
      <p className={styles.emptyNote} data-el="quest.signupEmpty">
        Sign in to claim a seat at this table.
      </p>
    );
  }
  if (characterStatus === 'loading' || characterStatus === 'idle') {
    return (
      <p className="type-caption" role="status" data-el="quest.signupLoading">
        Checking your characters…
      </p>
    );
  }
  if (characterStatus === 'error' && characterError) {
    return <StatePanel status="error" error={characterError} />;
  }
  if (characterStatus === 'empty' || !characterId) {
    return (
      <div data-el="quest.signupEmpty">
        <EmptyState
          kind="no-characters"
          message="Create a character before you can sign up."
        >
          <Link className="btn" to="/characters">
            Your characters
          </Link>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className={styles.actionRow} data-el="quest.signupReady">
      <Button
        type="button"
        disabled={signupPending}
        onClick={() => onSignup(characterId)}
      >
        Sign up
      </Button>
      {signupPending ? (
        <p className="type-caption" role="status">
          Signing up…
        </p>
      ) : null}
      {signupError ? (
        <StatePanel status="error" error={toAppError(signupError, 'quest:mutation')} />
      ) : null}
    </div>
  );
}

function TransitionActions({
  dm,
  machineStatus,
  transitionPending,
  closePending,
  transitionError,
  closeError,
  onPlayed,
  onClose,
}: {
  dm: boolean;
  machineStatus: string;
  transitionPending: boolean;
  closePending: boolean;
  transitionError: unknown;
  closeError: unknown;
  onPlayed: () => void;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!dm) return null;
  if (!canMutateStatus(machineStatus)) {
    return (
      <p className={styles.emptyNote} data-el="quest.transitionEmpty">
        No status changes on this table.
      </p>
    );
  }
  const mutationError = transitionError ?? closeError;
  return (
    <div className={styles.actions} data-el="quest.transitionReady">
      <div className={styles.actionRow}>
        <Button
          type="button"
          variant="ghost"
          disabled={transitionPending}
          onClick={onPlayed}
        >
          Mark played
        </Button>
        <Button type="button" variant="ghost" disabled={closePending} onClick={onClose}>
          Close
        </Button>
        {transitionPending || closePending ? (
          <p className="type-caption" role="status">
            Updating table…
          </p>
        ) : null}
      </div>
      {mutationError ? (
        <StatePanel status="error" error={toAppError(mutationError, 'quest:mutation')} />
      ) : null}
    </div>
  );
}

function readyRegions(
  quest: QuestDetailView,
  opts: {
    isAuthenticated: boolean;
    dm: boolean;
    characterId: string | undefined;
    characterStatus: 'idle' | 'loading' | 'error' | 'empty' | 'ready';
    characterError?: AppError;
    mutations: ReturnType<typeof useQuestMutations>;
  },
): PageRegionRenderers {
  const badge = questBadgeStatus(quest.status);
  const schedule = formatSchedule(quest.scheduledAt);
  const { mutations } = opts;

  return {
    summary: () => (
      <header className={styles.hero} data-el="quest.summary">
        <p className="eyebrow">{quest.shortCode}</p>
        <h1 className="type-display">{quest.title}</h1>
        <div className={styles.meta}>
          {badge ? (
            <StatusBadge status={badge} />
          ) : (
            <Chip tone="status">{quest.status}</Chip>
          )}
          <p className="type-caption">
            {quest.filledCount}/{quest.slotsMax} seats · {quest.durationHours}h
          </p>
          {quest.dmName ? <p className="type-caption">DM {quest.dmName}</p> : null}
        </div>
        {schedule ? (
          <p className="type-caption">
            <span className="type-label">Scheduled </span>
            <time dateTime={quest.scheduledAt}>{schedule}</time>
          </p>
        ) : null}
        <div className={styles.deliveryShelf} aria-label="Discord delivery">
          <DiscordDeliveryStatus delivery={quest.discordDelivery} />
        </div>
        <Link className="type-link" to={`/quests/${quest.shortCode}/summary`}>
          Session summaries
        </Link>
        <div className={styles.actions}>
          <SignupActions
            isAuthenticated={opts.isAuthenticated}
            characterId={opts.characterId}
            characterStatus={opts.characterStatus}
            characterError={opts.characterError}
            signupPending={mutations.signup.isPending}
            signupError={mutations.signup.error}
            onSignup={(id) => mutations.signup.mutate(id)}
          />
          <TransitionActions
            dm={opts.dm}
            machineStatus={quest.machineStatus}
            transitionPending={mutations.transition.isPending}
            closePending={mutations.close.isPending}
            transitionError={mutations.transition.error}
            closeError={mutations.close.error}
            onPlayed={() => mutations.transition.mutate('played')}
            onClose={() => mutations.close.mutate()}
          />
        </div>
      </header>
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
                  <StatePanel status="empty" emptyMessage="No participants yet." />
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
                <p className="type-caption">Scheduled: {quest.scheduledAt || '—'}</p>
              </section>
            ),
          },
        ]}
      />
    ),
  };
}

function statusRegions(
  status: 'error' | 'loading' | 'empty',
  error?: AppError,
): PageRegionRenderers {
  return {
    summary: () =>
      status === 'error' ? (
        <StatePanel status="error" error={error} />
      ) : status === 'loading' ? (
        <StatePanel status="loading" />
      ) : (
        <StatePanel status="empty" emptyMessage="That quest is not on the board." />
      ),
    roster: emptyRegion,
  };
}

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

  let characterStatus: 'idle' | 'loading' | 'error' | 'empty' | 'ready' = 'idle';
  let characterError: AppError | undefined;
  let firstCharacterId: string | undefined;
  if (!isAuthenticated) {
    characterStatus = 'idle';
  } else if (signupChar.isError) {
    characterStatus = 'error';
    characterError = toAppError(signupChar.error, 'quest:signup-character');
  } else if (signupChar.isLoading || signupChar.isPending) {
    characterStatus = 'loading';
  } else if (signupChar.data) {
    characterStatus = 'ready';
    firstCharacterId = signupChar.data;
  } else {
    characterStatus = 'empty';
  }

  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, {
              isAuthenticated,
              dm,
              characterId: firstCharacterId,
              characterStatus,
              characterError,
              mutations,
            });

  return (
    <PageShell>
      <div className={`ctx-rpg ${styles.root}`} data-el="quest.detail">
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}

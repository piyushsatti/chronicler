import { useId, useRef, useState } from 'react';
import { Menu } from '../../components/primitives/Menu.js';
import { Modal } from '../../components/primitives/Modal.js';
import { Popover } from '../../components/primitives/Popover.js';
import { Button } from '../../components/primitives/Button.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { toAppError } from '../../errors/toAppError.js';
import { personLabels } from '../../utils/format.js';
import { markerHandle, type HideMarker, type HideScope } from './hideMarkers.js';
import { useMarkerMemberSearch } from './hooks/useMarkerMemberSearch.js';
import styles from './editor.module.css';

const HIDE_HINT = 'Hide text from players';

function EyeOffGlyph(): React.JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

/**
 * Member search dialog; picks a handle a marker can address. The Hide menu
 * uses it for "Only for a member…" and the preview for "View as @member".
 */
export function MemberPicker({
  onPick,
  onClose,
  finalFocus,
  title = 'Only for a member',
  description = 'Only the member you choose can read the hidden text.',
}: {
  onPick: (handle: string) => void;
  onClose: () => void;
  finalFocus?: () => boolean;
  title?: string;
  description?: string;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const members = useMarkerMemberSearch(search);
  const names = personLabels(members.matches);
  return (
    <Modal
      open
      size="sm"
      title={title}
      description={description}
      onClose={onClose}
      finalFocus={finalFocus}
    >
      <div className="stack">
        <label className="field">
          <span className="field-label">Find a member by name or handle</span>
          <input
            className="field-input"
            placeholder="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {members.error ? (
          <StatePanel
            variant="inline"
            status="error"
            error={toAppError(members.error, 'editor:hide-member')}
          />
        ) : members.loading ? (
          <StatePanel variant="inline" status="loading" />
        ) : search.trim() && members.matches.length === 0 ? (
          <p className="type-caption">No matching members.</p>
        ) : (
          <ul
            className={`stack ${styles.items}`}
            data-gap="2"
            aria-label="Matching members"
          >
            {members.matches.map((member, index) => {
              const handle = markerHandle(member.handle);
              return (
                <li key={member.memberId}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={handle === null}
                    onClick={() => {
                      if (handle !== null) onPick(handle);
                    }}
                  >
                    Choose {names[index]}
                  </Button>
                  <span className="type-caption">
                    {handle === null
                      ? `@${member.handle} can’t be used to hide text`
                      : `@${handle}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {members.total > members.matches.length ? (
          <p className="type-caption">Type more of the name to narrow the list.</p>
        ) : null}
      </div>
    </Modal>
  );
}

/** What the editor would write for a marker; `commit` writes it. */
export type HidePlan = { replaces: HideScope | null; commit: () => void };

function confirmCopy(marker: HideMarker): { question: string; action: string } {
  if (marker.kind === 'spoiler') {
    return {
      question:
        'This text is currently hidden from players. Make it visible to everyone as a spoiler?',
      action: 'Make it a spoiler',
    };
  }
  const who = marker.kind === 'dm' ? 'DMs only' : `only @${marker.handle}`;
  return {
    question: `This text is currently hidden from players. Change who can read it to ${who}?`,
    action: 'Change who can read it',
  };
}

/**
 * Toolbar "Hide" menu: writes a D20 audience marker around the selection so
 * authors never type marker syntax. `onOpen` lets the editor keep the
 * selection before focus moves into the menu or a dialog. Changing text that
 * is already hidden asks first. After an edit, the menu or dialog that
 * closes hands focus to the editor (Base UI `finalFocus`) instead of the
 * trigger; `restoreFocus` focuses the new text. Cancelling keeps the default.
 */
export function HideMenu({
  onOpen,
  plan,
  restoreFocus,
}: {
  onOpen: () => void;
  plan: (marker: HideMarker) => HidePlan | null;
  restoreFocus: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState<{
    marker: HideMarker;
    plan: HidePlan;
  } | null>(null);
  const hintId = useId();
  const committed = useRef(false);
  const commit = (accepted: HidePlan): void => {
    committed.current = true;
    accepted.commit();
  };
  const finalFocus = (): boolean => {
    if (!committed.current) return true;
    committed.current = false;
    restoreFocus();
    return false;
  };
  const choose = (marker: HideMarker): void => {
    const next = plan(marker);
    if (!next) return;
    if (next.replaces) setConfirming({ marker, plan: next });
    else commit(next);
  };
  const copy = confirming ? confirmCopy(confirming.marker) : null;
  return (
    <span className="row" data-gap="1">
      <span id={hintId} className={styles.srLegend}>
        {HIDE_HINT}
      </span>
      <Menu
        ariaLabel="Hide text"
        triggerDescribedBy={hintId}
        open={open}
        finalFocus={finalFocus}
        onOpenChange={(next) => {
          if (next) onOpen();
          setOpen(next);
        }}
        trigger={
          <span className="btn btn--ghost btn--sm" title={HIDE_HINT}>
            <EyeOffGlyph />
            Hide
          </span>
        }
        items={[
          { key: 'dm', label: 'DMs only', onSelect: () => choose({ kind: 'dm' }) },
          {
            key: 'member',
            label: 'Only for a member…',
            onSelect: () => setPicking(true),
          },
          {
            key: 'spoiler',
            label: 'Spoiler',
            onSelect: () => choose({ kind: 'spoiler' }),
          },
        ]}
      />
      <Popover
        ariaLabel="How hiding works"
        trigger={
          <span className="btn btn--ghost btn--sm" title="How hiding works">
            <span aria-hidden="true">?</span>
            <span className={styles.srLegend}>How hiding works</span>
          </span>
        }
      >
        <p className="type-caption">DMs only: only DMs can read it.</p>
        <p className="type-caption">
          Only for a member: only the member you choose can read it.
        </p>
        <p className="type-caption">
          Spoiler: everyone sees it blurred until they reveal it.
        </p>
        <pre className={`type-caption ${styles.widgetSource}`}>
          {'> [!dm]\n> The mayor leads the cult.'}
        </pre>
        <p className="type-caption">
          Hidden blocks get a badge; Preview shows the page as a player, a DM or one
          member reads it.
        </p>
      </Popover>
      {picking ? (
        <MemberPicker
          finalFocus={finalFocus}
          onClose={() => setPicking(false)}
          onPick={(handle) => {
            setPicking(false);
            choose({ kind: 'member', handle });
          }}
        />
      ) : null}
      {confirming && copy ? (
        <Modal
          open
          size="sm"
          title="Change hidden text?"
          onClose={() => setConfirming(null)}
          finalFocus={finalFocus}
        >
          <p>{copy.question}</p>
          <div className="row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming(null)}
            >
              Keep it hidden
            </Button>
            <Button
              type="button"
              onClick={() => {
                const { plan: accepted } = confirming;
                setConfirming(null);
                commit(accepted);
              }}
            >
              {copy.action}
            </Button>
          </div>
        </Modal>
      ) : null}
    </span>
  );
}

import { useId, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { personLabels } from '../../../utils/format.js';
import type { AppError } from '../../../errors/types.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import type { Attendance, QuestCommand, Reward } from '../adapters/questCommands.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Select } from '../../../components/primitives/Select.js';

export type AttendanceRow = {
  characterId: string;
  status: '' | 'played' | 'no_show';
  pcxp: string;
  note: string;
};
export function closeInput(
  rows: AttendanceRow[],
): { attendance: Attendance[]; rewards: Reward[] } | null {
  const attendance: Attendance[] = [],
    rewards: Reward[] = [];
  for (const row of rows) {
    if (row.status === '') return null;
    attendance.push({ characterId: row.characterId, status: row.status });
    const value = Number(row.pcxp);
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 2147483647 ||
      (row.status !== 'played' && value !== 0)
    )
      return null;
    if (value > 0)
      rewards.push({
        characterId: row.characterId,
        pcxp: value,
        ...(row.note.trim() ? { note: row.note.trim() } : {}),
      });
  }
  if (rewards.reduce((total, reward) => total + reward.pcxp, 0) > 2147483647)
    return null;
  return { attendance, rewards };
}

export function QuestDmActions({
  quest,
  pending,
  execute,
  error,
}: {
  quest: QuestDetailView;
  pending: boolean;
  execute: (command: QuestCommand) => Promise<boolean>;
  error: AppError | null;
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const attendanceLabelId = useId();
  const roster = quest.participants.filter(
    (participant) => participant.status !== 'withdrawn',
  );
  const rosterLabels = personLabels(
    roster.map((participant) => ({
      id: participant.memberId,
      displayName: participant.memberDisplayName,
      handle: participant.memberHandle,
    })),
  );
  const memberLabelByCharacterId = new Map(
    roster.map((participant, index) => [participant.characterId, rosterLabels[index]]),
  );
  const [rows, setRows] = useState<AttendanceRow[]>(() =>
    roster.map((participant) => ({
      characterId: participant.characterId,
      status:
        participant.status === 'played' || participant.status === 'no_show'
          ? participant.status
          : '',
      pcxp: '0',
      note: '',
    })),
  );
  const [confirm, setConfirm] = useState<'played' | 'close' | null>(null);
  const preplay = quest.machineStatus === 'open' || quest.machineStatus === 'full';
  const unlimited = quest.signupType === 'dm_pick';
  const seatsLeft = Math.max(0, quest.slotsMax - quest.filledCount);
  const pickLimit =
    quest.signupType === 'last_game_played' ? Math.min(2, seatsLeft) : seatsLeft;
  const canFillByLastPlayed =
    quest.signupType === 'last_game_played' &&
    seatsLeft > 0 &&
    quest.participants.some((participant) => participant.status === 'waitlisted');
  const input = closeInput(rows);
  const validRows =
    rows.length === roster.length &&
    roster.every((participant) =>
      rows.some((row) => row.characterId === participant.characterId),
    );
  const change = (id: string, patch: Partial<Omit<AttendanceRow, 'characterId'>>) =>
    setRows((current) =>
      current.map((row) => (row.characterId === id ? { ...row, ...patch } : row)),
    );
  return (
    <Card as="section" pad={5} className="stack" aria-label="DM controls">
      <h2 className="type-title">DM controls</h2>
      {preplay ? (
        <>
          <div className="row" data-gap="2" data-wrap="1" data-justify="between">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => setConfirm('played')}
            >
              Mark played
            </Button>
            <Button
              variant="secondary"
              disabled={pending || quest.filledCount < 1}
              onClick={() => {
                void execute({ kind: 'publishPlayerList', questId: quest.id });
              }}
            >
              Publish player list
            </Button>
          </div>
          {quest.participants.some(
            (participant) => participant.status === 'waitlisted',
          ) ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void execute({
                  kind: 'select',
                  questId: quest.id,
                  characterIds: selected,
                  fillByLastGamePlayed: false,
                }).then((success) => {
                  if (success) setSelected([]);
                });
              }}
            >
              <h3 className="type-title">Select waitlisted characters</h3>
              <p className="type-caption">
                {unlimited
                  ? 'Seat any waitlisted characters. There is no seat cap. '
                  : `${seatsLeft} seats available. `}
                Current character eligibility is checked when you save.
                {quest.signupType === 'last_game_played'
                  ? ' You can reserve two players. The list is ordered for you: new players first, then the players who have waited longest since their last played game.'
                  : ''}
              </p>
              {quest.participants
                .filter((participant) => participant.status === 'waitlisted')
                .map((participant) => (
                  <Checkbox
                    key={participant.characterId}
                    label={`${participant.characterName} · ${memberLabelByCharacterId.get(participant.characterId)}`}
                    checked={selected.includes(participant.characterId)}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, participant.characterId]
                          : current.filter((id) => id !== participant.characterId),
                      )
                    }
                  />
                ))}
              <div className="stack-row">
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    selected.length === 0 ||
                    selected.length > 100 ||
                    (!unlimited && selected.length > pickLimit)
                  }
                >
                  Confirm selection
                </Button>
                {canFillByLastPlayed ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      void execute({
                        kind: 'select',
                        questId: quest.id,
                        characterIds: [],
                        fillByLastGamePlayed: true,
                      });
                    }}
                  >
                    Add by Last Game Played
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}
        </>
      ) : quest.machineStatus === 'played' ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (input && validRows) setConfirm('close');
          }}
        >
          <p>
            Record final attendance for each character. PCXP is awarded only when the
            quest closes. Zero records no award.
          </p>
          {roster.map((participant, index) => {
            const row = rows.find(
              (item) => item.characterId === participant.characterId,
            );
            return (
              <fieldset
                className="card stack"
                key={participant.characterId}
                disabled={pending}
              >
                <legend>
                  {participant.characterName} · {rosterLabels[index]}
                </legend>
                <div className="stack">
                  <span id={`${attendanceLabelId}-${participant.characterId}`}>Attendance</span>
                  <Select
                    label="Attendance"
                    labelId={`${attendanceLabelId}-${participant.characterId}`}
                    disabled={pending}
                    value={row?.status ?? ''}
                    aria-required
                    onValueChange={(value) => {
                      if (value === 'played' || value === 'no_show' || value === '')
                        change(participant.characterId, {
                          status: value,
                          ...(value !== 'played' ? { pcxp: '0' } : {}),
                        });
                    }}
                    options={[
                      { value: '', label: 'Choose attendance' },
                      { value: 'played', label: 'Played' },
                      { value: 'no_show', label: 'No show' },
                    ]}
                  />
                </div>
                <label className="stack">
                  PCXP award
                  <input
                    aria-label="PCXP award"
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={row?.pcxp ?? '0'}
                    disabled={row?.status !== 'played'}
                    onChange={(event) =>
                      change(participant.characterId, { pcxp: event.target.value })
                    }
                  />
                </label>
                <label className="stack">
                  Award note (optional)
                  <input
                    aria-label="Award note (optional)"
                    value={row?.note ?? ''}
                    disabled={row?.status !== 'played'}
                    onChange={(event) =>
                      change(participant.characterId, { note: event.target.value })
                    }
                  />
                </label>
              </fieldset>
            );
          })}
          <div className="row" data-gap="2">
            <Button
              variant="secondary"
              disabled={pending || !input || !validRows}
              onClick={() => {
                if (input)
                  void execute({
                    kind: 'attest',
                    questId: quest.id,
                    entries: input.attendance,
                  });
              }}
            >
              Save attendance
            </Button>
            <Button type="submit" disabled={pending || !input || !validRows}>
              Review closure
            </Button>
          </div>
        </form>
      ) : (
        <p className="type-caption">
          This quest is {quest.machineStatus}. Attendance and rewards are final.
        </p>
      )}
      <Modal
        open={confirm !== null}
        title={
          confirm === 'close'
            ? 'Close quest'
            : 'Mark session played'
        }
        onClose={() => {
          if (!pending) setConfirm(null);
        }}
      >
        {error ? <StatePanel status="error" error={error} /> : null}
        {confirm === 'close' ? (
          <p>
            Close with {input?.attendance.length ?? 0} final attendance records and{' '}
            {input?.rewards.reduce((total, award) => total + award.pcxp, 0) ?? 0} PCXP
            awarded. Closure is final.
          </p>
        ) : (
          <p>
            End signups and move this session to attendance and reward recording?
          </p>
        )}
        <Button
          pending={pending}
          disabled={pending || (confirm === 'close' && (!input || !validRows))}
          onClick={() => {
            if (confirm === 'close' && input && validRows)
              void execute({ kind: 'close', questId: quest.id, ...input }).then(
                (success) => {
                  if (success) setConfirm(null);
                },
              );
            else if (confirm === 'played')
              void execute({ kind: 'transition', questId: quest.id, to: confirm }).then(
                (success) => {
                  if (success) setConfirm(null);
                },
              );
          }}
        >
          {confirm === 'close'
            ? input?.rewards.length
              ? 'Close and award PCXP'
              : 'Close with zero PCXP'
            : 'Confirm'}
        </Button>
      </Modal>
    </Card>
  );
}

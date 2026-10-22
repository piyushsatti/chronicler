import { useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { DowntimeProject } from '../adapters/characterActivityAdapter.js';
import { useCharacterActivity } from '../hooks/useCharacterActivity.js';
import { statusLabel } from '../../../utils/format.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';

export function CharacterActivityPanel({
  characterId,
  owner,
}: {
  characterId: string;
  owner: boolean;
}): React.JSX.Element {
  const state = useCharacterActivity(characterId);
  const { formatDate } = useDateFormatter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<DowntimeProject | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [progress, setProgress] = useState('0');
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const edit = (project: DowntimeProject | null) => {
    setEditing(project);
    setName(project?.name ?? '');
    setGoal(project?.goal ?? '');
    setProgress(String(project?.progress ?? 0));
    setTarget(project?.target == null ? '' : String(project.target));
    setStatus(project?.status ?? 'active');
    setNotes(project?.notes ?? '');
  };
  if (state.query.isError)
    return (
      <StatePanel
        variant="inline"
        status="error"
        error={toAppError(state.query.error, 'character:activity')}
        onRetry={state.retry}
      />
    );
  if (state.query.isPending || !state.query.data)
    return <StatePanel variant="inline" status="loading" />;
  const data = state.query.data;
  return (
    <div className="stack" data-gap="5">
      <section className="stack" aria-labelledby="character-logs-heading">
        <h2 id="character-logs-heading" className="type-heading">
          Character log
        </h2>
        {data.characterLogs.items.length ? (
          <ul className="stack">
            {data.characterLogs.items.map((log) => (
              <li key={log.id}>
                <p className="type-body">{log.body}</p>
                <p className="type-caption">{formatDate(log.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-caption">No log entries on this page.</p>
        )}
        {owner ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              state.write.mutate(
                { kind: 'log', body: body.trim() },
                { onSuccess: () => setBody('') },
              );
            }}
          >
            <label className="stack">
              <span className="type-label">New log entry</span>
              <textarea
                className="field-input"
                required
                maxLength={8000}
                aria-label="New log entry"
                disabled={state.write.isPending}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              disabled={!body.trim()}
              pending={state.write.isPending}
            >
              Add log entry
            </Button>
          </form>
        ) : null}
      </section>
      <section className="stack" aria-labelledby="downtime-heading">
        <h2 id="downtime-heading" className="type-heading">
          Downtime projects
        </h2>
        {data.downtimeProjects.items.length ? (
          <ul className="stack">
            {data.downtimeProjects.items.map((project) => (
              <li key={project.id}>
                <h3 className="type-title">{project.name}</h3>
                <p className="type-caption">
                  {project.progress}
                  {project.target == null ? '' : ` / ${project.target}`} ·{' '}
                  {statusLabel(project.status)}
                </p>
                {project.goal ? <p>{project.goal}</p> : null}
                {project.notes ? <p className="type-caption">{project.notes}</p> : null}
                {owner ? (
                  <Button
                    variant="ghost"
                    disabled={state.write.isPending}
                    onClick={() => edit(project)}
                  >
                    Edit {project.name}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-caption">No downtime projects on this page.</p>
        )}
        {owner ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              state.write.mutate(
                {
                  kind: 'downtime',
                  input: {
                    id: editing?.id ?? null,
                    name: name.trim(),
                    goal: goal.trim() || null,
                    progress: Number(progress),
                    target: target ? Number(target) : null,
                    status,
                    notes: notes.trim() || null,
                  },
                },
                { onSuccess: () => edit(null) },
              );
            }}
          >
            <h3 className="type-title">
              {editing ? 'Edit downtime project' : 'New downtime project'}
            </h3>
            <label className="stack">
              <span className="type-label">Project name</span>
              <input
                className="field-input"
                required
                maxLength={200}
                aria-label="Project name"
                disabled={state.write.isPending}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="stack">
              <span className="type-label">Project goal</span>
              <input
                className="field-input"
                maxLength={2000}
                aria-label="Project goal"
                disabled={state.write.isPending}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            <div className="row" data-wrap="1">
              <label className="stack">
                <span className="type-label">Progress</span>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  step="1"
                  required
                  aria-label="Progress"
                  disabled={state.write.isPending}
                  value={progress}
                  onChange={(event) => setProgress(event.target.value)}
                />
              </label>
              <label className="stack">
                <span className="type-label">Target</span>
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  step="1"
                  aria-label="Target"
                  disabled={state.write.isPending}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              <label className="stack">
                <span className="type-label">Project status</span>
                <select
                  className="field-input"
                  aria-label="Project status"
                  disabled={state.write.isPending}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </label>
            </div>
            <label className="stack">
              <span className="type-label">Project notes</span>
              <textarea
                className="field-input"
                maxLength={2000}
                aria-label="Project notes"
                disabled={state.write.isPending}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <div className="row">
              <Button
                type="submit"
                disabled={!name.trim()}
                pending={state.write.isPending}
              >
                Save downtime project
              </Button>
              {editing ? (
                <Button
                  variant="ghost"
                  disabled={state.write.isPending}
                  onClick={() => edit(null)}
                >
                  Cancel editing
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </section>
      {owner ? (
        <section className="stack">
          <h2 className="type-heading">Record progression</h2>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              state.write.mutate(
                { kind: 'xp', amount: Number(amount), note: note.trim() },
                {
                  onSuccess: () => {
                    setAmount('');
                    setNote('');
                  },
                },
              );
            }}
          >
            <label className="stack">
              <span className="type-label">PCXP adjustment</span>
              <input
                className="field-input"
                type="number"
                required
                step="1"
                aria-label="PCXP adjustment"
                disabled={state.write.isPending}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="stack">
              <span className="type-label">Progression note</span>
              <input
                className="field-input"
                maxLength={2000}
                required
                aria-label="Progression note"
                disabled={state.write.isPending}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              pending={state.write.isPending}
              disabled={!note.trim() || !amount}
            >
              Record PCXP
            </Button>
          </form>
        </section>
      ) : null}
      {state.write.isSuccess ? (
        <p role="status" className="type-caption">
          Activity saved.
        </p>
      ) : null}
      {state.write.isError ? (
        <StatePanel
          variant="inline"
          status="error"
          error={toAppError(state.write.error, 'character:activity')}
        />
      ) : null}
      <nav className="row" aria-label="Character activity pages">
        <Button
          variant="ghost"
          disabled={state.page === 1 || state.query.isFetching}
          onClick={() => state.setPage(state.page - 1)}
        >
          Previous activity
        </Button>
        <span className="type-caption">Page {state.page}</span>
        <Button
          variant="ghost"
          disabled={
            state.page * state.pageSize >=
              Math.max(data.characterLogs.total, data.downtimeProjects.total) ||
            state.query.isFetching
          }
          onClick={() => state.setPage(state.page + 1)}
        >
          Next activity
        </Button>
      </nav>
    </div>
  );
}

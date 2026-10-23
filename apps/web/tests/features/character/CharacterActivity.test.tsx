import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterActivityPanel } from '../../../src/features/character/components/CharacterActivityPanel.js';
import { loadCharacterActivity } from '../../../src/features/character/adapters/characterActivityAdapter.js';
import {
  loadCharacterDirectory,
  loadCreationOptions,
} from '../../../src/features/character/adapters/characterDirectoryAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signInCharacter } from './characterAuth.js';
beforeEach(() => signInCharacter());
const characterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const recordId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Character activity', () => {
  it('writes and reloads logs, signed progression and an existing downtime project', async () => {
    let log = '';
    let project = {
      id: recordId,
      name: 'Study',
      goal: null,
      progress: 1,
      target: 5,
      status: 'active',
      notes: null,
      updatedAt: '2026-10-20T00:00:00Z',
    };
    const requests: { kind: string; variables: Record<string, unknown> }[] = [];
    server.use(
      graphql.query('CharacterActivity', () =>
        HttpResponse.json({
          data: {
            characterLogs: {
              items: log
                ? [{ id: recordId, body: log, createdAt: '2026-10-20T00:00:00Z' }]
                : [],
              total: log ? 1 : 0,
            },
            downtimeProjects: { items: [project], total: 1 },
          },
        }),
      ),
      graphql.mutation('LogCharacterEvent', ({ variables }) => {
        log = String(variables.body);
        requests.push({ kind: 'log', variables });
        return HttpResponse.json({
          data: { logCharacterEvent: { id: recordId, body: log } },
        });
      }),
      graphql.mutation('AdjustPcxp', ({ variables }) => {
        requests.push({ kind: 'xp', variables });
        return HttpResponse.json({
          data: { adjustPcxp: { id: recordId, amount: variables.amount } },
        });
      }),
      graphql.mutation('UpsertDowntimeProject', ({ variables }) => {
        requests.push({ kind: 'project', variables });
        project = { ...project, progress: 3, status: 'completed' };
        return HttpResponse.json({
          data: {
            upsertDowntimeProject: {
              id: recordId,
              name: project.name,
              status: project.status,
              progress: 3,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterActivityPanel characterId={characterId} owner />);
    await screen.findByRole('button', { name: 'Edit Study' });
    await user.type(screen.getByLabelText('New log entry'), 'Persisted diary');
    await user.click(screen.getByRole('button', { name: 'Add log entry' }));
    await screen.findByText('Persisted diary');
    await user.type(screen.getByLabelText('PCXP adjustment'), '-2');
    await user.type(screen.getByLabelText('Progression note'), 'Correction');
    await user.click(screen.getByRole('button', { name: 'Record PCXP' }));
    await waitFor(() =>
      expect(requests.find((item) => item.kind === 'xp')?.variables).toMatchObject({
        characterId,
        amount: -2,
        note: 'Correction',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Edit Study' }));
    await user.clear(screen.getByLabelText('Progress'));
    await user.type(screen.getByLabelText('Progress'), '3');
    await user.click(screen.getByRole('button', { name: /^Project status / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Completed' }));
    await user.click(screen.getByRole('button', { name: 'Save downtime project' }));
    await waitFor(() =>
      expect(requests.find((item) => item.kind === 'project')?.variables).toMatchObject(
        {
          characterId,
          input: {
            id: recordId,
            name: 'Study',
            progress: 3,
            target: 5,
            status: 'completed',
          },
        },
      ),
    );
    await screen.findByText('3 / 5 · Completed');
  });
  it('does not offer write forms to another viewer', async () => {
    renderWithProviders(
      <CharacterActivityPanel characterId={characterId} owner={false} />,
    );
    await screen.findByText('No log entries on this page.');
    expect(screen.queryByLabelText('New log entry')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('PCXP adjustment')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save downtime project' }),
    ).not.toBeInTheDocument();
  });
  it('rejects malformed directory and activity responses at their boundaries', async () => {
    server.use(
      graphql.query('CharacterDirectory', () =>
        HttpResponse.json({ data: { characters: { items: [], total: 'bad' } } }),
      ),
      graphql.query('CharacterActivity', () =>
        HttpResponse.json({
          data: {
            characterLogs: { items: [{ id: recordId, body: 7 }], total: 1 },
            downtimeProjects: { items: [], total: 0 },
          },
        }),
      ),
    );
    await expect(loadCharacterDirectory({}, 24, 0)).rejects.toMatchObject({
      kind: 'invalid',
    });
    await expect(loadCharacterActivity(characterId, 0)).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
  it('loads creation references beyond the first server page', async () => {
    const offsets: number[] = [];
    const items = Array.from({ length: 101 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      name: `Origin ${index}`,
    }));
    server.use(
      graphql.query('Backstories', ({ variables }) => {
        const offset = Number(variables.offset);
        offsets.push(offset);
        return HttpResponse.json({
          data: {
            backstories: {
              items: items.slice(offset, offset + 100),
              total: items.length,
            },
          },
        });
      }),
    );
    const options = await loadCreationOptions('');
    expect(options.backstories).toHaveLength(101);
    expect(offsets).toEqual([0, 100]);
  });
});

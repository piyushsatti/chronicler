import { act, renderHook, waitFor } from '@testing-library/react';
import { graphql, http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { useNavigate } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { useEditorPage } from '../../../src/features/editor/hooks/useEditorPage.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';

describe('useEditorPage (controlled MSW record and option reads)', () => {
  beforeEach(seedEditorSession);

  it('owns loading then ready record state and route-specific cancel', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('EditorQuestLoad', async () => {
        await pending;
        return HttpResponse.json({
          data: {
            quest: {
              id: 'quest-1',
              shortCode: 'Q-1',
              scheduledAt: '2026-10-15T18:00:00Z',
              durationHours: 3,
              slotsMax: 4,
              briefDocument: {
                id: 'doc-1',
                title: 'Loaded quest',
                effectiveBody: 'Loaded body',
              },
            },
          },
        });
      }),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    expect(result.current.status).toBe('loading');
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.view.meta.title).toBe('Loaded quest');
    expect(result.current.view.body).toBe('Loaded body');
    expect(result.current.view.cancelTo).toBe('/quests/Q-1');
  });

  it('does not replace the current route with a late result from the previous record', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('EditorQuestLoad', async ({ variables }) => {
        const code = String(variables.shortCode);
        if (code === 'Q-1') await pending;
        return HttpResponse.json({
          data: {
            quest: {
              id: code,
              shortCode: code,
              scheduledAt: '2026-10-15T18:00:00Z',
              durationHours: 3,
              slotsMax: 4,
              briefDocument: {
                id: `${code}-doc`,
                title: code,
                effectiveBody: `${code} body`,
              },
            },
          },
        });
      }),
    );
    const harness = editorHarness();
    const { result } = renderHook(
      () => ({
        page: useEditorPage({ typeKey: 'quest', mode: 'edit' }),
        navigate: useNavigate(),
      }),
      harness,
    );
    expect(result.current.page.status).toBe('loading');
    act(() => result.current.navigate('/quests/Q-2/edit'));
    await waitFor(() => {
      if (result.current.page.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.page.view.body).toBe('Q-2 body');
    });
    release();
    await waitFor(() =>
      expect(
        harness.queryClient
          .getQueryCache()
          .findAll({ queryKey: ['editor', 'record'] })
          .some((query) => query.state.fetchStatus === 'fetching'),
      ).toBe(false),
    );
    if (result.current.page.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.page.view.body).toBe('Q-2 body');
  });

  it('surfaces controlled errors, retaining NotFound as an error', async () => {
    server.use(
      graphql.query('EditorQuestLoad', () =>
        HttpResponse.json({ data: { quest: null } }),
      ),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({
      status: 'error',
      error: { kind: 'not_found', userMessage: 'That item could not be found.' },
    });
  });

  it('rejects invalid record wire without manufacturing an empty draft', async () => {
    server.use(
      graphql.query('EditorQuestLoad', () =>
        HttpResponse.json({ data: { quest: { id: 'wrong' } } }),
      ),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({
      status: 'error',
      error: { kind: 'invalid' },
    });
  });

  it('keeps a blank new document ready and does not request quest field options', async () => {
    let optionRequests = 0;
    server.use(
      http.get('/v1/quests/genre-options', () => {
        optionRequests++;
        return HttpResponse.json({ options: [] });
      }),
      graphql.query('EditorRegions', () => {
        optionRequests++;
        return HttpResponse.json({ data: { regions: [] } });
      }),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'codex', mode: 'new' }),
      editorHarness('/codex/new', '/codex/new'),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.view.meta.title).toBe('');
    expect(result.current.view.body).toBe('');
    expect(result.current.view.publishDisabled).toBe(true);
    expect(optionRequests).toBe(0);
  });

  it('preserves dirty body and saved local metadata across a same-record refetch', async () => {
    const harness = editorHarness();
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      harness,
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      if (result.current.status === 'ready')
        result.current.view.setBody('Edited draft body');
    });
    act(() => {
      if (result.current.status === 'ready')
        result.current.view.setMeta((meta) => ({ ...meta, title: 'Edited title' }));
    });
    act(() => {
      if (result.current.status === 'ready') result.current.view.onSaveDraft();
    });
    await harness.queryClient.invalidateQueries({ queryKey: ['editor', 'record'] });
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.view.body).toBe('Edited draft body');
      expect(result.current.view.meta.title).toBe('Edited title');
      expect(result.current.view.isDirty).toBe(true);
    });
    const draft = JSON.parse(
      localStorage.getItem(
        draftStorageKey('quest', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      ) ?? '{}',
    ) as { body?: string };
    expect(draft.body).toBe('Edited draft body');
  });

  it('shows region failure while genre suggestions are still loading; retry recovers independently', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('EditorRegions', () =>
        HttpResponse.json({ data: { regions: [{ id: 42 }] } }),
      ),
      http.get('/v1/quests/genre-options', async () => {
        await pending;
        return HttpResponse.json({ options: ['exploration'] });
      }),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.view.options.regions.status).toBe('error');
      expect(result.current.view.options.genres.status).toBe('loading');
    });
    server.use(
      graphql.query('EditorRegions', () =>
        HttpResponse.json({
          data: { regions: [{ id: 'region-1', name: 'Salt Coast' }] },
        }),
      ),
    );
    act(() => {
      if (
        result.current.status === 'ready' &&
        result.current.view.options.regions.status === 'error'
      )
        result.current.view.options.regions.onRetry();
    });
    release();
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.view.options.regions).toMatchObject({
        status: 'ready',
        items: [{ id: 'region-1', name: 'Salt Coast' }],
      });
      expect(result.current.view.options.genres).toMatchObject({
        status: 'ready',
        items: ['exploration'],
      });
    });
  });

  it('shows genre failure while regions are still loading without static suggestions', async () => {
    server.use(
      graphql.query('EditorRegions', async () => {
        await delay(100);
        return HttpResponse.json({ data: { regions: [] } });
      }),
      http.get('/v1/quests/genre-options', () => HttpResponse.json({ options: [42] })),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.view.options.genres.status).toBe('error');
      expect(result.current.view.options.regions.status).toBe('loading');
    });
  });

  it('distinguishes genuinely empty option responses from failures', async () => {
    server.use(
      graphql.query('EditorRegions', () =>
        HttpResponse.json({ data: { regions: [] } }),
      ),
      http.get('/v1/quests/genre-options', () => HttpResponse.json({ options: [] })),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.view.options.regions.status).toBe('empty');
      expect(result.current.view.options.genres.status).toBe('empty');
    });
  });

  it('does not load protected records without an authenticated session', async () => {
    localStorage.clear();
    let requests = 0;
    server.use(
      graphql.query('EditorQuestLoad', () => {
        requests++;
        return HttpResponse.json({ data: { quest: null } });
      }),
    );
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'edit' }),
      editorHarness(),
    );
    expect(result.current.status).toBe('loading');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requests).toBe(0);
  });
});

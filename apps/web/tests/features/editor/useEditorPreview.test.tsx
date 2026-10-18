import { act, renderHook, waitFor } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { useEditorPreview } from '../../../src/features/editor/hooks/useEditorPreview.js';
import { parseEditorPreview } from '../../../src/features/editor/adapters/editorMutations.js';
import { editorHarness } from './editor-test-utils.js';

describe('preview Zod edge and retained adapter hook (controlled local proof)', () => {
  it('rejects malformed or absent preview data, while accepting an explicitly empty body', () => {
    expect(parseEditorPreview({ body: 42 }).ok).toBe(false);
    expect(parseEditorPreview({}).ok).toBe(false);
    expect(parseEditorPreview(undefined).ok).toBe(false);
    expect(parseEditorPreview({ body: '' })).toEqual({ ok: true, data: '' });
    expect(parseEditorPreview({ preview: 'Compatible preview' })).toEqual({
      ok: true,
      data: 'Compatible preview',
    });
    expect(parseEditorPreview('Direct string')).toEqual({
      ok: true,
      data: 'Direct string',
    });
  });

  it('does not request preview until its callback, then posts the selected body/audience', async () => {
    const requests: unknown[] = [];
    server.use(
      graphql.query('PreviewBody', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({ data: { previewBody: 'Server preview' } });
      }),
    );
    const { result, rerender } = renderHook(({ body }) => useEditorPreview(body), {
      ...editorHarness('/editor-demo', '/editor-demo'),
      initialProps: { body: 'Private draft' },
    });
    expect(result.current.preview.status).toBe('idle');
    expect(requests).toHaveLength(0);
    act(() => result.current.onPreview());
    await waitFor(() =>
      expect(result.current.preview).toEqual({
        status: 'ready',
        body: 'Server preview',
      }),
    );
    expect(requests).toEqual([
      { body: 'Private draft', audience: 'PLAYER', authorId: null },
    ]);
    rerender({ body: 'Changed draft' });
    expect(result.current.preview.status).toBe('idle');
  });

  it('shows malformed-preview failure and retains a retry callback', async () => {
    server.use(
      graphql.query('PreviewBody', () =>
        HttpResponse.json({ data: { previewBody: 42 as unknown as string } }),
      ),
    );
    const { result } = renderHook(
      () => useEditorPreview('Private draft'),
      editorHarness('/editor-demo', '/editor-demo'),
    );
    act(() => result.current.onPreview());
    await waitFor(() =>
      expect(result.current.preview).toMatchObject({
        status: 'error',
        error: { kind: 'invalid' },
      }),
    );
    server.use(
      graphql.query('PreviewBody', () =>
        HttpResponse.json({ data: { previewBody: 'Safe retry' } }),
      ),
    );
    act(() => result.current.onPreview());
    await waitFor(() =>
      expect(result.current.preview).toEqual({ status: 'ready', body: 'Safe retry' }),
    );
  });

  it('does not expose an earlier body response after the current draft changes', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('PreviewBody', async () => {
        await pending;
        return HttpResponse.json({ data: { previewBody: 'Old response' } });
      }),
    );
    const harness = editorHarness('/editor-demo', '/editor-demo');
    const { result, rerender } = renderHook(({ body }) => useEditorPreview(body), {
      ...harness,
      initialProps: { body: 'Old draft' },
    });
    act(() => result.current.onPreview());
    await waitFor(() => expect(result.current.preview.status).toBe('loading'));
    rerender({ body: 'New draft' });
    release();
    await waitFor(() =>
      expect(harness.queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
        'success',
      ),
    );
    expect(result.current.preview.status).toBe('idle');
  });
});

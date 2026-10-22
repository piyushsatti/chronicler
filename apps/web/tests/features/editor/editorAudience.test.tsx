import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { createTestQueryClient } from '../../../src/providers.js';
import { server } from '../../../src/mocks/server.js';
import { useEditorAudience } from '../../../src/features/editor/hooks/useEditorAudience.js';
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
it('selects named readers through server pages while retaining existing reader identity', async () => {
  const offsets: number[] = [];
  server.use(
    graphql.query('EditorAudienceMember', ({ variables }) =>
      HttpResponse.json({
        data: {
          member: {
            id: variables.id,
            handle: variables.id === firstId ? 'first-reader' : 'second-reader',
            displayName: 'Reader',
          },
        },
      }),
    ),
    graphql.query('EditorAudienceMembers', ({ variables }) => {
      offsets.push(Number(variables.offset));
      return HttpResponse.json({
        data: {
          communityDirectory: {
            total: 21,
            entries: [
              {
                memberId: secondId,
                handle: 'second-reader',
                displayName: 'Second Reader',
              },
            ],
          },
        },
      });
    }),
  );
  const { result } = renderHook(
    () => {
      const [readerIds, setReaderIds] = useState(firstId);
      return useEditorAudience({
        readerIds,
        setReaderIds,
        enabled: true,
        scopeKey: 'actor:doc',
      });
    },
    { wrapper },
  );
  await waitFor(() =>
    expect(result.current.selected).toEqual([{ id: firstId, label: 'first-reader' }]),
  );
  act(() => result.current.setSearch('second'));
  await waitFor(() => expect(result.current.matches[0]?.handle).toBe('second-reader'));
  act(() => result.current.next());
  await waitFor(() => expect(offsets).toContain(20));
  act(() => result.current.add(secondId));
  await waitFor(() => expect(result.current.selectedIds).toEqual([firstId, secondId]));
  act(() => result.current.remove(firstId));
  expect(result.current.selectedIds).toEqual([secondId]);
});
it('resets search and page state for a different account or record', () => {
  const { result, rerender } = renderHook(
    ({ scopeKey }) =>
      useEditorAudience({
        readerIds: '',
        setReaderIds: () => {},
        enabled: false,
        scopeKey,
      }),
    { wrapper, initialProps: { scopeKey: 'a:doc' } },
  );
  act(() => result.current.setSearch('Private name'));
  act(() => result.current.next());
  rerender({ scopeKey: 'b:other-doc' });
  expect(result.current.search).toBe('');
  expect(result.current.offset).toBe(0);
});

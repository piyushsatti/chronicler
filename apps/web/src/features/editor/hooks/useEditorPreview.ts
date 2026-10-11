import { useMutation } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import { previewBodyAs } from '../adapters/editorMutations.js';
import type { EditorPreview } from '../types.js';

export function useEditorPreview(body: string): {
  preview: EditorPreview;
  onPreview: () => void;
} {
  const mutation = useMutation({
    mutationFn: async (source: string) => ({
      source,
      body: await previewBodyAs({ body: source, audience: 'public' }),
    }),
  });
  const onPreview = (): void => {
    mutation.mutate(body);
  };
  if (mutation.isError && mutation.variables === body)
    return {
      preview: { status: 'error', error: toAppError(mutation.error, 'editor:preview') },
      onPreview,
    };
  if (mutation.isPending && mutation.variables === body)
    return { preview: { status: 'loading' }, onPreview };
  if (mutation.data?.source === body)
    return { preview: { status: 'ready', body: mutation.data.body }, onPreview };
  return { preview: { status: 'idle' }, onPreview };
}

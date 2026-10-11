import { useQuery } from '@tanstack/react-query';
import { loadEditorRecord } from '../adapters/editorLoad.js';
import { queryKeys } from '../feature.js';

export type EditorRecordInput = Parameters<typeof loadEditorRecord>[0];

export function useEditorRecord(input: EditorRecordInput, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.record(input),
    queryFn: () => loadEditorRecord(input),
    enabled,
  });
}

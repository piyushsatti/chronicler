import { useQuery } from '@tanstack/react-query';
import { loadAudienceMembers } from '../adapters/editorAudienceMembers.js';

/**
 * Member search for the Hide menu's "Only for a member…" picker. Same
 * directory query and adapter as the readers panel (useEditorAudience), first
 * page only: the author narrows by typing.
 */
export function useMarkerMemberSearch(search: string) {
  const term = search.trim();
  const directory = useQuery({
    queryKey: ['editor', 'audience-members', 'marker', term],
    queryFn: () => loadAudienceMembers(term, 0),
    enabled: term.length > 0,
  });
  return {
    matches: directory.data?.entries ?? [],
    total: directory.data?.total ?? 0,
    loading: directory.isFetching,
    error: directory.error,
  };
}

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadSummaryCharacters, loadSummaryQuests } from '../adapters/editorSummary.js';
import type { EditorLoadResult, EditorMeta } from '../adapters/editorLoad.js';
import { parseSummaryRelations } from '../editorValidation.js';

export function useEditorSummaryLinks({
  initial,
  meta,
  setMeta,
  enabled,
  scopeKey,
}: {
  initial: EditorLoadResult;
  meta: EditorMeta;
  setMeta: Dispatch<SetStateAction<EditorMeta>>;
  enabled: boolean;
  scopeKey: string;
}) {
  const source = initial.summary?.authoring;
  const active =
    initial.summary !== undefined &&
    (source === null ||
      source?.complete === false ||
      (source?.questIds.length ?? 0) > 0);
  const editable =
    active &&
    enabled &&
    initial.canEditMetadata &&
    initial.canEditBody &&
    source?.complete === true;
  const [navigation, setNavigation] = useState({
    scopeKey,
    search: '',
    questOffset: 0,
    characterOffset: 0,
  });
  const page =
    navigation.scopeKey === scopeKey
      ? navigation
      : { scopeKey, search: '', questOffset: 0, characterOffset: 0 };
  const [known, setKnown] = useState({
    scopeKey,
    quests: initial.summary?.quests ?? [],
  });
  const refs =
    known.scopeKey === scopeKey ? known.quests : (initial.summary?.quests ?? []);
  const quests = useQuery({
    queryKey: ['editor', 'summary-quests', scopeKey, page.search, page.questOffset],
    queryFn: () => loadSummaryQuests(page.search.trim(), page.questOffset),
    enabled: editable,
  });
  const characters = useQuery({
    queryKey: ['editor', 'summary-characters', scopeKey, page.characterOffset],
    queryFn: () => loadSummaryCharacters(page.characterOffset),
    enabled: editable,
  });
  const parsed = parseSummaryRelations(meta);
  const ids = parsed.success ? parsed.data.questIds : [];
  const characterId = parsed.success ? parsed.data.characterId : null;
  return {
    active,
    editable,
    search: page.search,
    setSearch: (search: string) => setNavigation({ ...page, search, questOffset: 0 }),
    selected: ids.map(
      (id) =>
        refs.find((quest) => quest.id === id) ??
        initial.summary?.quests.find((quest) => quest.id === id) ?? {
          id,
          shortCode: 'Linked quest',
          title: null,
        },
    ),
    add: (id: string) => {
      const choice = quests.data?.items.find((quest) => quest.id === id);
      if (!editable || !choice || ids.includes(id)) return;
      setKnown({
        scopeKey,
        quests: [...refs.filter((quest) => quest.id !== id), choice],
      });
      setMeta((old) => ({ ...old, questIds: [...ids, id] }));
    },
    remove: (id: string) => {
      if (editable)
        setMeta((old) => ({ ...old, questIds: ids.filter((value) => value !== id) }));
    },
    characterId,
    setCharacter: (id: string) => {
      if (editable) setMeta((old) => ({ ...old, characterId: id || null }));
    },
    quests: {
      items: quests.data?.items ?? [],
      total: quests.data?.total ?? 0,
      offset: page.questOffset,
      loading: quests.isFetching,
      error: quests.error,
      retry: () => {
        void quests.refetch();
      },
      previous: () =>
        setNavigation({ ...page, questOffset: Math.max(0, page.questOffset - 20) }),
      next: () => setNavigation({ ...page, questOffset: page.questOffset + 20 }),
    },
    characters: {
      items: characters.data?.items ?? [],
      total: characters.data?.total ?? 0,
      offset: page.characterOffset,
      loading: characters.isFetching,
      error: characters.error,
      retry: () => {
        void characters.refetch();
      },
      previous: () =>
        setNavigation({
          ...page,
          characterOffset: Math.max(0, page.characterOffset - 20),
        }),
      next: () =>
        setNavigation({ ...page, characterOffset: page.characterOffset + 20 }),
    },
  };
}
export type EditorSummaryLinksView = ReturnType<typeof useEditorSummaryLinks>;

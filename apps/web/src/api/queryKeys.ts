import { featureQueryKeys } from '../chrome/featureRegistry.js';

export const queryKeys = featureQueryKeys as {
  home: readonly ['home'];
  homeLanes: readonly ['homeLanes'];
  siteStats: readonly ['siteStats'];
  me: readonly ['me'];
  character: (id: string) => readonly ['character', string];
  characters: (filters: string) => readonly ['characters', string];
  characterProgression: (id: string) => readonly ['characterProgression', string];
  document: (slug: string) => readonly ['document', string];
  codexDirectory: (prefix: string) => readonly ['codexDirectory', string];
  codexEntry: (slug: string) => readonly ['codexEntry', string];
  map: (atlasCode: string) => readonly ['map', string];
  mapView: (atlasCode: string) => readonly ['mapView', string];
  hexFeatures: (hexcode: string) => readonly ['hexFeatures', string];
  questBoard: readonly ['questBoard'];
  questLists: readonly ['quests'];
  questList: (
    filters: Readonly<{ status?: string; displayStatus?: string }>,
    limit: number,
    offset: number,
  ) => readonly ['quests', { readonly status: string | null; readonly displayStatus: string | null }, number, number];
  quest: (code: string) => readonly ['quest', string];
  questSummary: (code: string) => readonly ['questSummary', string];
  chronicleList: readonly ['chronicleList'];
  chronicleDetail: (slug: string) => readonly ['chronicleDetail', string];
  rulesHub: readonly ['rulesHub'];
  ruleDetail: (slug: string) => readonly ['ruleDetail', string];
  communityHub: readonly ['communityHub'];
  communityMembers: (role: string) => readonly ['communityMembers', string];
  search: (q: string, kinds: string) => readonly ['search', string, string];
  searchKinds: readonly ['searchKinds'];
  pendingDmProfiles: readonly ['pendingDmProfiles'];
  pendingCharacters: readonly ['pendingCharacters'];
  adminOperations: readonly ['adminOperations'];
  adminCharacters: readonly ['adminCharacters'];
  notifications: readonly ['notifications'];
  notificationsPreview: (
    limit: number,
  ) => readonly ['notifications', 'preview', number];
  notificationsInbox: (limit: number) => readonly ['notifications', 'inbox', number];
  notificationsUnread: readonly ['notificationsUnread'];
  personalization: readonly ['personalization'];
  backstories: readonly ['backstories'];
};

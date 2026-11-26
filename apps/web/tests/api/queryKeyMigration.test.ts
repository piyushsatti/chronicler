import { partialMatchKey, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../src/api/queryKeys.js';

// Each `expected` is the inline key a hook wrote before it moved into the
// factory, evaluated with the sample values below. A cache entry keeps its
// identity only while these stay equal.
const cache = 'cache-1';
const filters = { status: 'open' };

const moved: ReadonlyArray<readonly [string, QueryKey, QueryKey]> = [
  // admin
  ['adminOperationsPage', queryKeys.adminOperationsPage(cache, 25, 50), ['adminOperations', cache, 25, 50]],
  ['adminPage', queryKeys.adminPage(['adminRegions'], cache, filters, 50), ['adminRegions', cache, filters, 50]],
  ['adminCommunityStats', queryKeys.adminCommunityStats(cache), ['adminCommunityStats', cache]],
  ['adminRegionOptions()', queryKeys.adminRegionOptions(), ['adminRegionOptions']],
  ['adminRegionOptions(cache)', queryKeys.adminRegionOptions(cache), ['adminRegionOptions', cache]],
  ['adminRegions()', queryKeys.adminRegions(), ['adminRegions']],
  ['adminRegions(cache)', queryKeys.adminRegions(cache), ['adminRegions', cache]],
  ['adminDiscordSettings()', queryKeys.adminDiscordSettings(), ['adminDiscordSettings']],
  ['adminDiscordSettings(cache)', queryKeys.adminDiscordSettings(cache), ['adminDiscordSettings', cache]],
  ['adminGameCalendar()', queryKeys.adminGameCalendar(), ['adminGameCalendar']],
  ['adminGameCalendar(cache)', queryKeys.adminGameCalendar(cache), ['adminGameCalendar', cache]],
  ['adminBackstories', queryKeys.adminBackstories, ['adminBackstories']],
  ['adminCreationCatalog', queryKeys.adminCreationCatalog, ['adminCreationCatalog']],
  ['adminMembers', queryKeys.adminMembers, ['adminMembers']],
  ['adminTimeAnchors', queryKeys.adminTimeAnchors, ['adminTimeAnchors']],
  ['adminCharacters', queryKeys.adminCharacters, ['adminCharacters']],
  ['voiceChannels', queryKeys.voiceChannels, ['editor', 'voiceChannels']],
  ['homeBanner()', queryKeys.homeBanner(), ['homeBanner']],
  ['homeBanner(cache)', queryKeys.homeBanner(cache), ['homeBanner', cache]],
  // character and member
  ['characterActivity(id, page)', queryKeys.characterActivity('ch1', 2), ['characterActivity', 'ch1', 2]],
  ['characterActivity(id)', queryKeys.characterActivity('ch1'), ['characterActivity', 'ch1']],
  ['characterAll', queryKeys.characterAll, ['character']],
  ['charactersAll', queryKeys.charactersAll, ['characters']],
  ['characterCreationOptions', queryKeys.characterCreationOptions('r1'), ['characterCreationOptions', 'r1']],
  ['characterRegions', queryKeys.characterRegions, ['characterRegions']],
  ['characterDirectory', queryKeys.characterDirectory(filters, 3), ['characters', 'directory', filters, 3]],
  ['characterOwner', queryKeys.characterOwner('o1'), ['characterOwner', 'o1']],
  ['characterOwner(null)', queryKeys.characterOwner(null), ['characterOwner', null]],
  ['characterParticipations', queryKeys.characterParticipations('ch1'), ['characterParticipations', 'ch1']],
  ['characterCoPlayers', queryKeys.characterCoPlayers('ch1'), ['characterCoPlayers', 'ch1']],
  ['characterSummaries', queryKeys.characterSummaries('ch1'), ['characterSummaries', 'ch1']],
  ['memberHub', queryKeys.memberHub('m1'), ['memberHub', 'm1']],
  ['myCharacters', queryKeys.myCharacters('m1'), ['characters', 'mine', 'm1']],
  ['myUpcomingQuests', queryKeys.myUpcomingQuests('m1'), ['quests', 'mine-upcoming', 'm1']],
  // quest and editor
  ['questBoardPages', queryKeys.questBoardPages(filters), ['quests', 'pages', filters]],
  ['questBoardChrome', queryKeys.questBoardChrome, ['questBoardChrome']],
  ['questCharacters', queryKeys.questCharacters('m1'), ['questCharacters', 'm1']],
  ['questCharacters(undefined)', queryKeys.questCharacters(undefined), ['questCharacters', undefined]],
  ['questAuthority', queryKeys.questAuthority('m1', 'h1'), ['questAuthority', 'm1', 'h1']],
  ['questAuthorityAll', queryKeys.questAuthorityAll, ['questAuthority']],
  ['questOptionsAll', queryKeys.questOptionsAll, ['questOptions']],
  ['questAll', queryKeys.questAll, ['quest']],
  ['questSummaryAll', queryKeys.questSummaryAll, ['questSummary']],
  ['questRosterCharacters', queryKeys.questRosterCharacters('ana'), ['questRosterCharacters', 'ana']],
  ['seriesOptionsFor', queryKeys.seriesOptionsFor('m1', true), ['editor', 'seriesOptions', 'm1', true]],
  ['questOptionMaps', queryKeys.questOptionMaps, ['questOptions', 'maps']],
  ['questOptionNodes', queryKeys.questOptionNodes('A1'), ['questOptions', 'nodes', 'A1']],
  ['audienceMembers', queryKeys.audienceMembers('s1', 'bo', 20), ['editor', 'audience-members', 's1', 'bo', 20]],
  ['audienceReaders', queryKeys.audienceReaders('s1', ['a', 'b']), ['editor', 'audience-readers', 's1', 'a', 'b']],
  ['revisions', queryKeys.revisions('d1', 10), ['editor', 'revisions', 'd1', 10]],
  ['summaryQuests', queryKeys.summaryQuests('s1', 'q', 5), ['editor', 'summary-quests', 's1', 'q', 5]],
  ['summaryCharacters', queryKeys.summaryCharacters('s1', 5), ['editor', 'summary-characters', 's1', 5]],
  // profile and community
  ['memberProfile', queryKeys.memberProfile('h1'), ['memberProfile', 'h1']],
  ['dmTable', queryKeys.dmTable('t1'), ['dm-table', 't1']],
  ['dmTableSchedule', queryKeys.dmTableSchedule('m1', 2), ['dm-table', 'schedule', 'm1', 2]],
  ['profileDmDetails', queryKeys.profileDmDetails('m1'), ['profileDmDetails', 'm1']],
  ['profileDmTier', queryKeys.profileDmTier, ['profileDmTier']],
  ['communityMembersAll', queryKeys.communityMembersAll, ['communityMembers']],
  ['communityDirectory', queryKeys.communityDirectory('dm', 'x', true, 2), ['communityMembers', 'dm', 'x', true, 2]],
  ['communityEntry', queryKeys.communityEntry('e1'), ['communityEntry', 'e1']],
  ['communityEntryRelated', queryKeys.communityEntryRelated('a1'), ['communityEntryRelated', 'a1']],
  ['communityRegions', queryKeys.communityRegions, ['communityRegions']],
  ['communityCharacters', queryKeys.communityCharacters(100), ['communityCharacters', 100]],
  ['communityHallOfFame', queryKeys.communityHallOfFame, ['communityHallOfFame']],
  // small slices
  ['chronicleListFor', queryKeys.chronicleListFor('auth'), [...queryKeys.chronicleList, 'auth']],
  ['codexEntryById', queryKeys.codexEntryById('c1'), ['codexEntryById', 'c1']],
  ['codexDirectorySearch', queryKeys.codexDirectorySearch('Lore', 'elf'), [...queryKeys.codexDirectory('Lore'), 'elf']],
  ['mapContainmentAll', queryKeys.mapContainmentAll, ['mapContainment']],
  ['mapDocumentAll', queryKeys.mapDocumentAll, ['mapDocument']],
  ['mapDocumentsAll', queryKeys.mapDocumentsAll, ['mapDocuments']],
  ['me', queryKeys.me, ['me']],
  ['notificationsPreviewFor', queryKeys.notificationsPreviewFor(20, 'auth'), [...queryKeys.notificationsPreview(20), 'auth']],
  ['notificationsInboxFor', queryKeys.notificationsInboxFor(30, null), [...queryKeys.notificationsInbox(30), null]],
  ['notificationsUnreadFor', queryKeys.notificationsUnreadFor('auth'), [...queryKeys.notificationsUnread, 'auth']],
  ['calendar', queryKeys.calendar('2026-11', undefined), ['calendar', '2026-11', undefined]],
  ['calendarQuests', queryKeys.calendarQuests(filters, 'UTC'), ['calendarQuests', filters, 'UTC']],
  ['calendarRealDates', queryKeys.calendarRealDates(4, 1), ['calendarRealDates', 4, 1]],
  ['retainedDocument', queryKeys.retainedDocument('doc'), ['retainedDocument', 'doc']],
  ['dmDashboard', queryKeys.dmDashboard(cache, 10, 'all'), ['dmDashboard', cache, 10, 'all']],
  ['liveDm', queryKeys.liveDm('m1', 'h1'), ['liveDm', 'm1', 'h1']],
  ['markerMembers', queryKeys.markerMembers('bo'), ['editor', 'audience-members', 'marker', 'bo']],
  ['profileCharacters', queryKeys.profileCharacters('m1', 2), ['profileCharacters', 'm1', 2]],
  ['profileActivity', queryKeys.profileActivity('m1'), ['profileActivity', 'm1']],
  ['profileHistory', queryKeys.profileHistory('m1'), ['profileHistory', 'm1']],
  ['personalizationFor', queryKeys.personalizationFor('m1'), [...queryKeys.personalization, 'm1']],
  ['series', queryKeys.series('arc-1'), ['series', 'arc-1']],
  ['seriesAll', queryKeys.seriesAll, ['series']],
  ['rulesHubFor', queryKeys.rulesHubFor(null), [...queryKeys.rulesHub, null]],
];

// Invalidations that refresh a family by prefix: every listed query must stay
// inside the prefix, or a write stops refreshing a page that used to update.
const families: ReadonlyArray<readonly [string, QueryKey, readonly QueryKey[]]> = [
  ['characters', queryKeys.charactersAll, [queryKeys.characterDirectory(filters, 1), queryKeys.myCharacters('m1'), queryKeys.characters('active')]],
  ['character', queryKeys.characterAll, [queryKeys.character('ch1')]],
  ['characterActivity', queryKeys.characterActivity('ch1'), [queryKeys.characterActivity('ch1', 3)]],
  ['quests', queryKeys.questLists, [queryKeys.questBoardPages(filters), queryKeys.myUpcomingQuests('m1'), queryKeys.questList({}, 20, 0)]],
  ['questOptions', queryKeys.questOptionsAll, [queryKeys.questOptionMaps, queryKeys.questOptionNodes('A1')]],
  ['quest', queryKeys.questAll, [queryKeys.quest('Q1')]],
  ['questSummary', queryKeys.questSummaryAll, [queryKeys.questSummary('Q1')]],
  ['questAuthority', queryKeys.questAuthorityAll, [queryKeys.questAuthority('m1', 'h1')]],
  ['communityMembers', queryKeys.communityMembersAll, [queryKeys.communityDirectory('player', '', false, 1), queryKeys.communityMembers('dm')]],
  ['adminRegions', queryKeys.adminRegions(cache), [queryKeys.adminPage(queryKeys.adminRegions(), cache, filters, 0)]],
  ['adminRegionOptions', queryKeys.adminRegionOptions(), [queryKeys.adminRegionOptions(cache)]],
  ['adminDiscordSettings', queryKeys.adminDiscordSettings(), [queryKeys.adminDiscordSettings(cache)]],
  ['adminGameCalendar', queryKeys.adminGameCalendar(), [queryKeys.adminGameCalendar(cache)]],
  ['adminOperations', queryKeys.adminOperations, [queryKeys.adminOperationsPage(cache, 0, 0)]],
  ['adminMembers', queryKeys.adminMembers, [queryKeys.adminPage(queryKeys.adminMembers, cache, filters, 0)]],
  ['homeBanner', queryKeys.homeBanner(), [queryKeys.homeBanner(cache)]],
  ['seriesOptions', queryKeys.seriesOptions, [queryKeys.seriesOptionsFor('m1', false)]],
  ['mapDocument', queryKeys.mapDocumentAll, [queryKeys.mapDocument('d1')]],
  ['mapDocuments', queryKeys.mapDocumentsAll, [queryKeys.mapDocuments(['d1', 'd2'])]],
  ['mapContainment', queryKeys.mapContainmentAll, [queryKeys.mapContainment('A1')]],
  ['notifications', queryKeys.notifications, [queryKeys.notificationsPreviewFor(20, 'auth'), queryKeys.notificationsInboxFor(30, 'auth')]],
  ['notificationsUnread', queryKeys.notificationsUnread, [queryKeys.notificationsUnreadFor('auth')]],
  ['chronicleList', queryKeys.chronicleList, [queryKeys.chronicleListFor('auth')]],
  ['rulesHub', queryKeys.rulesHub, [queryKeys.rulesHubFor('auth')]],
  ['series', queryKeys.seriesAll, [queryKeys.series('arc-1')]],
  ['personalization', queryKeys.personalization, [queryKeys.personalizationFor('m1')]],
  ['codexDirectory', queryKeys.codexDirectory('Lore'), [queryKeys.codexDirectorySearch('Lore', 'elf')]],
];

describe('query keys moved into the factory', () => {
  it.each(moved)('%s builds the same key as the inline original', (_name, built, expected) => {
    expect(built).toStrictEqual(expected);
  });

  it.each(families)('%s prefix still reaches its family', (_name, prefix, members) => {
    for (const member of members) {
      expect(partialMatchKey(member, prefix), JSON.stringify(member)).toBe(true);
    }
  });
});

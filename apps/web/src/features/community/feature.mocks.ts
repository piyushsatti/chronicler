import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodCommunity from '../../../tests/fixtures/wire/community/directory-good.json';
import goodCommunityEntry from '../../../tests/fixtures/wire/community/entry-good.json';
import goodCharacters from '../../../tests/fixtures/wire/community/characters-good.json';

export const graphql: FeatureGraphql = {
  CommunityEntry: () => HttpResponse.json({ data: { document: goodCommunityEntry } }),
  CommunityEntryRelated: () => HttpResponse.json({ data: { documents: { items: [goodCommunityEntry] } } }),
  CommunityDirectory: () =>
    HttpResponse.json({ data: { communityDirectory: goodCommunity } }),
  CommunityHallOfFame: () => HttpResponse.json({ data: { document: null } }),
  CommunityCharacters: () =>
    HttpResponse.json({ data: { characters: goodCharacters } }),
};

export const handlers: FeatureHandlers = [];

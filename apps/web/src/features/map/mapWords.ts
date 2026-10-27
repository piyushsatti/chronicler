import { pluralize } from '../../utils/format.js';

/**
 * How a map's places are drawn and named. A hex map is made of hexes, each holding
 * Features and Locations. A point map has Locations pinned at x,y positions.
 * Owner and tester ruling (M4-16): a hex is never called a location.
 */
export type MapGrid = 'point' | 'hex';

export type MapPlaceWords = {
  /** "hex" or "location". */
  one: string;
  /** "hexes" or "locations". */
  many: string;
  /** "Hex" or "Location". */
  One: string;
  /** "Hexes" or "Locations". */
  Many: string;
};

type MapShape = {
  grid?: string;
  edges?: readonly { kind: string }[];
};

const HEX: MapPlaceWords = { one: 'hex', many: 'hexes', One: 'Hex', Many: 'Hexes' };
const POINT: MapPlaceWords = {
  one: 'location',
  many: 'locations',
  One: 'Location',
  Many: 'Locations',
};

/** A hex map is one marked `hex`, or one whose routes are hex adjacency links. */
export function isHexMap(map: MapShape): boolean {
  return map.grid === 'hex' || (map.edges ?? []).some((edge) => edge.kind === 'hex');
}

export function placeWords(map: MapShape): MapPlaceWords {
  return isHexMap(map) ? HEX : POINT;
}

/** "1 hex", "12 hexes", "1 location", "3 locations". */
export function countPlaces(map: MapShape, count: number): string {
  const words = placeWords(map);
  return pluralize(count, words.one, words.many);
}

/** What kind of map this is, in plain words, for cards and forms. */
export function mapKindLabel(map: MapShape): string {
  return isHexMap(map) ? 'Hex map' : 'Point map';
}

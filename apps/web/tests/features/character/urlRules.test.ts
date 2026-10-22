import { describe, expect, it } from 'vitest';
import {
  ddbUrlError,
  isDdbCharacterUrl,
} from '../../../src/features/character/ddbUrl.js';
import {
  imageUrlError,
  isCharacterImageUrl,
} from '../../../src/features/character/imageUrl.js';
// Shared with the API's Go tests (internal/character/url_rules_fixture_test.go) so drift fails CI.
import vectors from '../../../../../packages/contracts/fixtures/url-rules.v1.json';

const image = vectors.characterImageUrl;
const padded = (length: number) =>
  image.length_prefix + 'a'.repeat(length - image.length_prefix.length);

describe('shared URL rule vectors (packages/contracts/fixtures/url-rules.v1.json)', () => {
  it.each(vectors.ddbCharacterUrl.valid)('accepts D&D Beyond link %s', (value) =>
    expect(isDdbCharacterUrl(value)).toBe(true),
  );
  it.each(vectors.ddbCharacterUrl.invalid)('rejects D&D Beyond link %s', (value) =>
    expect(isDdbCharacterUrl(value)).toBe(false),
  );
  it.each([...image.valid, padded(image.max_length)])('accepts image %s', (value) =>
    expect(isCharacterImageUrl(value)).toBe(true),
  );
  it.each([...image.invalid, padded(image.max_length + 1)])(
    'rejects image %s',
    (value) => expect(isCharacterImageUrl(value)).toBe(false),
  );
});

describe('D&D Beyond link rule (matches the API canonical check)', () => {
  it.each([
    'https://www.dndbeyond.com/characters/123456',
    'https://www.dndbeyond.com/characters/7/',
    'HTTPS://WWW.DNDBEYOND.COM/characters/7',
    '  https://www.dndbeyond.com/characters/9223372036854775807  ',
  ])('accepts %s', (value) => expect(isDdbCharacterUrl(value)).toBe(true));

  it.each([
    'http://www.dndbeyond.com/characters/1',
    'https://dndbeyond.com/characters/1',
    'https://www.dndbeyond.com/profile/someone/characters/1',
    'https://www.dndbeyond.com/Characters/1',
    'https://www.dndbeyond.com/characters/0',
    'https://www.dndbeyond.com/characters/9223372036854775808',
    'https://www.dndbeyond.com/characters/1?tab=spells',
    'https://www.dndbeyond.com/characters/1#x',
    'https://www.dndbeyond.com:443/characters/1',
    'https://user@www.dndbeyond.com/characters/1',
    'https://www.dndbeyond.com/characters/1//',
    'https://www.dndbeyond.com/characters/abc',
    'https://www.dnd\tbeyond.com/characters/1',
  ])('rejects %s', (value) => expect(isDdbCharacterUrl(value)).toBe(false));

  it('explains the expected link', () => {
    expect(ddbUrlError('')).toBe('Enter the D&D Beyond link for this character.');
    expect(ddbUrlError('https://dndbeyond.com/characters/1')).toBe(
      'Use your D&D Beyond character link, like https://www.dndbeyond.com/characters/123456',
    );
  });
});

describe('character image URL rule (matches the API and DB check)', () => {
  it.each([
    'https://example.com/portrait.png',
    'https://cdn.example.org/a/b.webp?size=200#top',
    `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`,
  ])('accepts %s', (value) => expect(isCharacterImageUrl(value)).toBe(true));

  it.each([
    'http://example.com/a.png',
    'HTTPS://example.com/a.png',
    'https:example.com/a.png',
    'https:///a.png',
    'https://user:pw@example.com/a.png',
    'https://@example.com/a.png',
    'https://example.com/a b.png',
    'https://example.com\\a.png',
    'https://example.com/%zz.png',
    'javascript:alert(1)',
    `https://example.com/${'a'.repeat(2049 - 'https://example.com/'.length)}`,
  ])('rejects %s', (value) => expect(isCharacterImageUrl(value)).toBe(false));

  it('is optional', () => {
    expect(imageUrlError('')).toBeUndefined();
    expect(imageUrlError('  ')).toBeUndefined();
    expect(imageUrlError('ftp://x/y.png')).toMatch(/https:\/\/ image link/);
  });
});

// UX-only copy: the API (ddb.go canonicalDdbCharacterID) is authoritative; packages/contracts/fixtures/url-rules.v1.json guards drift.
export const DDB_URL_HINT = 'https://www.dndbeyond.com/characters/123456';

// Raw-string match so whitespace, query, fragment, port and credentials can never
// slip through URL normalisation; the id must fit the API's 63-bit ParseUint.
const DDB_CHARACTER_URL = /^https:\/\/www\.dndbeyond\.com(\/characters\/(\d+)\/?)$/i;
const MAX_DDB_ID = 2n ** 63n - 1n;

/**
 * Mirrors the API's canonical rule (`canonicalDdbCharacterID`, ddb.go):
 * https://www.dndbeyond.com/characters/<positive number>, optional trailing slash.
 * Scheme and host are case-insensitive there; the path is not.
 */
export function isDdbCharacterUrl(value: string): boolean {
  const match = DDB_CHARACTER_URL.exec(value.trim());
  if (!match?.[1]?.startsWith('/characters/') || !match[2]) return false;
  const id = BigInt(match[2]);
  return id > 0n && id <= MAX_DDB_ID;
}

export function ddbUrlError(value: string): string | undefined {
  if (!value.trim()) return 'Enter the D&D Beyond link for this character.';
  if (!isDdbCharacterUrl(value))
    return `Use your D&D Beyond character link, like ${DDB_URL_HINT}`;
  return undefined;
}

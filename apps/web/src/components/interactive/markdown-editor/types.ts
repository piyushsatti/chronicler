export type EntityLinkEntry = {
  id: string;
  label: string;
  href?: string;
  kind?: string;
};

export type EntityLinkIndex = EntityLinkEntry[];

export type BodySpanKind =
  | 'DM'
  | 'MEMBER'
  | 'SPOILER'
  | 'MALFORMED'
  | 'LOOKALIKE'
  | 'LIST_NESTED';

/** One marked span of a body, as the server's marker parser reports it (1-based lines). */
export type BodySpanAudit = {
  startLine: number;
  endLine: number;
  kind: BodySpanKind;
  handle: string | null;
  suggestion: string | null;
  token: string | null;
  tokenLine: number | null;
  tokenColumn: number | null;
};

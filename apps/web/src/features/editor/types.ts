import type { AppError } from '../../errors/types.js';
import type { EditorRegionRow } from './adapters/editorRegionsAdapter.js';

export type EditorTypeKey =
  'quest' | 'codex' | 'summary' | 'guide' | 'ruling' | 'dm-table' | 'demo';
export type EditorMode = 'new' | 'edit';
export type EditorRouteProps = { typeKey: EditorTypeKey; mode: EditorMode };
export type EditorOptions<T> =
  | { status: 'error'; error: AppError; onRetry: () => void }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: T[] };
export type EditorFieldOptions = {
  regions: EditorOptions<EditorRegionRow>;
  genres: EditorOptions<string>;
  /** The viewer's own series, for a new quest. */
  series: EditorOptions<{ id: string; name: string }>;
};
export type EditorPreview =
  | { status: 'error'; error: AppError }
  | { status: 'loading' }
  | { status: 'idle' }
  | { status: 'ready'; body: string };

export type FieldType =
  | 'text'
  | 'code'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'toggle'
  | 'tags'
  | 'genretags'
  | 'region'
  | 'series'
  | 'regionmulti'
  | 'slots'
  | 'datetime'
  | 'worlddate'
  | 'status'
  | 'pairs'
  | 'stub';

export type FieldSchema = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  readOnly?: boolean;
  options?: string[] | [string, string][];
  /** Multiselect: the option preselected for a new record. Picking another option
   *  while it is the only one selected replaces it, unless the user picked it. */
  defaultOption?: string;
  mono?: boolean;
  normalize?: (v: string) => string;
  validate?: (v: unknown) => string | null;
};

export type EditorMeta = Record<string, unknown>;

export type EntityLinkEntry = {
  id: string;
  label: string;
  href?: string;
  kind?: string;
};

export type EntityLinkIndex = EntityLinkEntry[];

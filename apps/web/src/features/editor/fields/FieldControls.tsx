import { useEffect, useRef, useState } from 'react';
import { DateTimePicker } from '../../../components/interactive/DateTimePicker.js';
import { Popover } from '../../../components/primitives/Popover.js';
import {
  QUEST_STATUSES,
  TAG_SUGGESTIONS,
  TZ_OPTIONS,
  WORLD_SEASONS,
} from '../editorConstants.js';
import type { EditorOptions, FieldSchema } from '../types.js';
import type { EditorRegionRow } from '../adapters/editorRegionsAdapter.js';
import { StubNotice } from '../../../components/foundation/StubNotice.js';

interface PickerProps<T extends string> {
  value: T;
  options: string[] | [string, string][];
  onChange: (v: T) => void;
  renderValue: (v: T) => React.ReactNode;
  renderOption: (o: string | [string, string]) => React.ReactNode;
  placeholder?: string;
}

function Picker<T extends string>({
  value,
  options,
  onChange,
  renderValue,
  renderOption,
  placeholder,
}: PickerProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      variant="menu"
      ariaLabel={placeholder ?? 'Choose an option'}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <span className="pf-pick">
          {value ? (
            renderValue(value)
          ) : (
            <span className="pf-ph">{placeholder ?? 'Select…'}</span>
          )}
          <span className="pf-caret">▾</span>
        </span>
      }
    >
      <div
        className="hf2 pf-menu-list"
        style={{ minWidth: 150, maxHeight: 240, overflowY: 'auto' }}
      >
        {options.map((o) => {
          const key = Array.isArray(o) ? o[0] : o;
          return (
            <button
              key={key}
              type="button"
              role="menuitem"
              className="pf-opt"
              onClick={() => {
                onChange(key as T);
                setOpen(false);
              }}
            >
              {renderOption(o)}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

function pfIcon(type: string): string {
  const map: Record<string, string> = {
    text: 'T',
    code: '#',
    textarea: '¶',
    status: '●',
    region: '◎',
    select: '▾',
    toggle: '◐',
    slots: '◫',
    datetime: '◷',
    worlddate: '☉',
    tags: '#',
    pairs: '≡',
    location: '⌖',
    multiselect: '▤',
    regionmulti: '◎',
    genretags: '#',
    stub: '…',
  };
  return map[type] ?? '·';
}

export function TextField({
  field,
  value,
  onChange,
  onCommit,
  bad,
}: {
  field: FieldSchema & { mono?: boolean };
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  bad?: boolean;
}): React.JSX.Element {
  return (
    <input
      className={`pf-input field${field.mono || field.type === 'code' ? ' pf-mono' : ''}${bad ? ' pf-bad' : ''}`}
      value={value ?? ''}
      readOnly={field.readOnly}
      placeholder={field.placeholder ?? ''}
      style={
        field.mono || field.type === 'code'
          ? { fontFamily: 'var(--font-mono)' }
          : undefined
      }
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
    />
  );
}

export function StatusField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const col = QUEST_STATUSES.find((s) => s[0] === value)?.[1] ?? 'var(--color-text-3)';
  return (
    <Picker
      value={value || QUEST_STATUSES[0][0]}
      options={QUEST_STATUSES.map((s) => s[0])}
      placeholder="Status"
      renderValue={(v) => (
        <span
          className="pf-pill"
          style={{
            color: col,
            background: `color-mix(in srgb, ${col} 11%, transparent)`,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />
          {v}
        </span>
      )}
      renderOption={(o) => {
        const v = o as string;
        const c = QUEST_STATUSES.find((s) => s[0] === v)?.[1] ?? 'var(--color-text-3)';
        return (
          <>
            <span className="pf-dot" style={{ background: c }} />
            {v}
          </>
        );
      }}
      onChange={onChange}
    />
  );
}

function OptionState<T>({
  options,
  label,
}: {
  options: EditorOptions<T>;
  label: string;
}): React.JSX.Element | null {
  if (options.status === 'error')
    return (
      <div role="alert">
        <p>{options.error.userMessage}</p>
        <button type="button" className="pf-input field" onClick={options.onRetry}>
          {label} unavailable — tap to retry
        </button>
      </div>
    );
  if (options.status === 'loading')
    return (
      <div className="pf-input field" aria-busy="true">
        Loading {label.toLowerCase()}…
      </div>
    );
  if (options.status === 'empty')
    return (
      <div className="pf-input field" aria-disabled="true">
        No {label.toLowerCase()} available
      </div>
    );
  return null;
}

export function RegionField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: EditorOptions<EditorRegionRow>;
}): React.JSX.Element {
  if (options.status !== 'ready')
    return (
      <div>
        <OptionState options={options} label="Regions" />
      </div>
    );
  const names = options.items.map((region) => region.name);
  return (
    <Picker
      value={value || names[0]}
      options={names}
      placeholder="Region"
      renderValue={(v) => (
        <span className="chip" data-tone="line">
          <span className="dot" />
          {v}
        </span>
      )}
      renderOption={(o) => o as string}
      onChange={onChange}
    />
  );
}

export function SlotsField({
  value,
  onChange,
}: {
  value: { filled: number; max: number };
  onChange: (v: { filled: number; max: number }) => void;
}): React.JSX.Element {
  const v = value ?? { filled: 0, max: 4 };
  return (
    <div className="pf-slots row">
      <input
        className="pf-num field"
        type="number"
        min={0}
        value={v.filled}
        onChange={(e) =>
          onChange({ ...v, filled: Number.parseInt(e.target.value, 10) || 0 })
        }
      />
      <span className="pf-slash">/</span>
      <input
        className="pf-num field"
        type="number"
        min={1}
        value={v.max}
        onChange={(e) =>
          onChange({ ...v, max: Number.parseInt(e.target.value, 10) || 1 })
        }
      />
      <span className="type-caption">seats</span>
    </div>
  );
}

export function TagField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const add = (raw: string): void => {
    const t = raw.trim().replace(/,$/, '');
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="pf-tags row" data-wrap="1">
      {value.map((t) => (
        <span key={t} className="pf-tag chip" data-tone="line">
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="pf-taginput field"
        list="pf-tag-sugg"
        aria-label="Add tag"
        value={draft}
        placeholder={value.length ? 'add…' : 'Add tags…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      <datalist id="pf-tag-sugg">
        {TAG_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function WorldDateField({
  value,
  onChange,
}: {
  value: { cy: string; season: string; day: string };
  onChange: (v: { cy: string; season: string; day: string }) => void;
}): React.JSX.Element {
  const v = value ?? { cy: '', season: WORLD_SEASONS[0], day: '' };
  return (
    <div className="row" data-gap="2">
      <input
        className="pf-input field pf-mono"
        style={{ maxWidth: 72, fontFamily: 'var(--font-mono)' }}
        placeholder="CY"
        value={v.cy}
        onChange={(e) => onChange({ ...v, cy: e.target.value })}
      />
      <Picker
        value={v.season || WORLD_SEASONS[0]}
        options={[...WORLD_SEASONS]}
        renderValue={(s) => s}
        renderOption={(o) => o as string}
        onChange={(season) => onChange({ ...v, season })}
      />
      <input
        className="pf-input field pf-mono"
        style={{ maxWidth: 56, fontFamily: 'var(--font-mono)' }}
        placeholder="Day"
        value={v.day}
        onChange={(e) => onChange({ ...v, day: e.target.value })}
      />
    </div>
  );
}

export function DateTimeField({
  value,
  onChange,
}: {
  value: { dt: string; tz: string };
  onChange: (v: { dt: string; tz: string }) => void;
}): React.JSX.Element {
  const v = value ?? { dt: '', tz: TZ_OPTIONS[0] };
  return (
    <div className="row" data-gap="2" data-wrap="1">
      <DateTimePicker
        value={v.dt}
        onChange={(dt) => onChange({ ...v, dt })}
        ariaLabel="Field datetime"
      />
      <Picker
        value={v.tz || TZ_OPTIONS[0]}
        options={[...TZ_OPTIONS]}
        renderValue={(tz) => tz}
        renderOption={(o) => o as string}
        onChange={(tz) => onChange({ ...v, tz })}
      />
    </div>
  );
}

export function SelectField({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const opts = field.options ?? [];
  const label = (val: string): string => {
    const o = opts.find((x) => (Array.isArray(x) ? x[0] : x) === val);
    return o ? (Array.isArray(o) ? o[1] || o[0] : o) : val;
  };
  return (
    <Picker
      value={value}
      options={opts}
      placeholder={field.placeholder ?? 'Select…'}
      renderValue={label}
      renderOption={(o) => (Array.isArray(o) ? o[1] || o[0] : o) as string}
      onChange={onChange}
    />
  );
}

export function ToggleField({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  const on = !!value;
  return (
    <button
      type="button"
      className="pf-toggle"
      data-on={on ? 1 : 0}
      onClick={() => onChange(!on)}
    >
      <span className="pf-knob" />
      <span className="pf-toggle-lbl">{on ? 'On' : 'Off'}</span>
      <span className="type-caption">{field.label}</span>
    </button>
  );
}

export function TextAreaField({
  field,
  value,
  onChange,
  onCommit,
  bad,
}: {
  field: FieldSchema;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  bad?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const size = (el: HTMLTextAreaElement | null): void => {
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(() => {
    size(ref.current);
  }, []);
  return (
    <textarea
      ref={ref}
      className={`pf-input field pf-area${bad ? ' pf-bad' : ''}`}
      rows={2}
      value={value ?? ''}
      placeholder={field.placeholder ?? ''}
      onChange={(e) => {
        onChange(e.target.value);
        size(e.target);
      }}
      onBlur={() => onCommit?.()}
    />
  );
}

export function PairsField({
  value,
  onChange,
}: {
  value: [string, string][];
  onChange: (v: [string, string][]) => void;
}): React.JSX.Element {
  const rows = value ?? [];
  const set = (i: number, j: 0 | 1, v: string): void => {
    const n = rows.map((r) => [...r] as [string, string]);
    n[i][j] = v;
    onChange(n);
  };
  return (
    <div className="pf-pairs stack">
      {rows.map((r, i) => (
        <div key={i} className="pf-pair row">
          <input
            className="pf-input field pf-mono"
            style={{ maxWidth: 130, fontFamily: 'var(--font-mono)' }}
            value={r[0]}
            placeholder="key"
            onChange={(e) => set(i, 0, e.target.value)}
          />
          <input
            className="pf-input field"
            value={r[1]}
            placeholder="value"
            onChange={(e) => set(i, 1, e.target.value)}
          />
          <button
            type="button"
            className="pf-pair-x btn btn--ghost"
            aria-label={r[0] ? `Remove pair "${r[0]}"` : `Remove row ${i + 1}`}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="pf-rowadd btn btn--ghost"
        onClick={() => onChange([...rows, ['', '']])}
      >
        + Add row
      </button>
    </div>
  );
}

export function MultiSelectField({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: string[];
  onChange: (v: string[]) => void;
}): React.JSX.Element {
  const opts = (field.options ?? []) as (string | [string, string])[];
  const selected = value ?? [];
  const toggle = (v: string): void => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div className="pf-tags row" data-wrap="1">
      {opts.map((opt) => {
        const [v, label] = Array.isArray(opt) ? opt : [opt, opt];
        return (
          <button
            key={v}
            type="button"
            className="pf-tag chip"
            data-tone={selected.includes(v) ? 'accent' : 'line'}
            aria-pressed={selected.includes(v)}
            onClick={() => toggle(v)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function RegionMultiField({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: EditorOptions<EditorRegionRow>;
}): React.JSX.Element {
  const regions = options.status === 'ready' ? options.items : [];
  const selected = value ?? [];
  const byId = new Map(regions.map((r) => [r.id, r.name]));
  const available = regions.filter((r) => !selected.includes(r.id));
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="pf-tags row" data-wrap="1">
        {selected.map((id) => (
          <span key={id} className="pf-tag chip" data-tone="line">
            {byId.get(id) ?? id}
            <button
              type="button"
              aria-label={`Remove region ${byId.get(id) ?? id}`}
              onClick={() => onChange(selected.filter((x) => x !== id))}
            >
              ×
            </button>
          </span>
        ))}
        {options.status !== 'ready' ? (
          <OptionState options={options} label="Regions" />
        ) : null}
        {options.status === 'ready' ? (
          <Popover
            variant="menu"
            open={open}
            onOpenChange={setOpen}
            ariaLabel="Add region"
            trigger={<span className="pf-pick pf-ph">+ Add region…</span>}
          >
            <div className="pf-menu-list">
              {available.length === 0 ? (
                <div className="pf-opt type-caption">No more regions</div>
              ) : null}
              {available.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="pf-opt"
                  role="menuitem"
                  onClick={() => {
                    onChange([...selected, r.id]);
                    setOpen(false);
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

/** Genre chips — suggestions from GET /v1/quests/genre-options (field-routing). */
export function GenreTagsField({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: EditorOptions<string>;
}): React.JSX.Element {
  const suggestions = options.status === 'ready' ? options.items : [];
  const [draft, setDraft] = useState('');
  const add = (raw: string): void => {
    const t = raw.trim().replace(/,$/, '');
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="pf-tags row" data-wrap="1">
      {value.map((t) => (
        <span key={t} className="pf-tag chip" data-tone="line">
          {t}
          <button
            type="button"
            aria-label={`Remove genre ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="pf-taginput field"
        list="pf-genre-sugg"
        aria-label="Add genre"
        value={draft}
        placeholder={value.length ? 'add…' : 'Add genres…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      {options.status !== 'ready' ? (
        <OptionState options={options} label="Genre suggestions" />
      ) : null}
      <datalist id="pf-genre-sugg">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function StubField({ field }: { field: FieldSchema }): React.JSX.Element {
  return <StubNotice message={field.placeholder ?? 'Not editable yet'} />;
}

export { pfIcon };

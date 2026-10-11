import { useState } from 'react';
import { fieldEmpty, schemaErrors } from './editorValidation.js';
import {
  DateTimeField,
  GenreTagsField,
  MultiSelectField,
  PairsField,
  pfIcon,
  RegionField,
  RegionMultiField,
  SelectField,
  SlotsField,
  StatusField,
  StubField,
  TagField,
  TextAreaField,
  TextField,
  ToggleField,
  WorldDateField,
} from './fields/FieldControls.js';
import type { EditorFieldOptions, EditorMeta, FieldSchema } from './types.js';

export function PropertiesPanel({
  schema,
  values,
  setValue,
  showErrors,
  slugLocked = false,
  options,
}: {
  schema: FieldSchema[];
  values: EditorMeta;
  setValue: (key: string, val: unknown) => void;
  showErrors: boolean;
  slugLocked?: boolean;
  options: EditorFieldOptions;
}): React.JSX.Element {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string): void =>
    setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const errs = schemaErrors(schema, values);

  const commit = (f: FieldSchema): void => {
    touch(f.key);
    if (f.normalize) {
      const raw = values[f.key];
      if (typeof raw === 'string') {
        const nv = f.normalize(raw);
        if (nv !== raw) setValue(f.key, nv);
      }
    }
  };

  const control = (f: FieldSchema): React.JSX.Element => {
    const field = slugLocked && f.key === 'slug' ? { ...f, readOnly: true } : f;
    const val = values[field.key];
    const setT = (v: unknown): void => {
      setValue(field.key, v);
      touch(field.key);
    };
    const setRaw = (v: unknown): void => setValue(field.key, v);
    const bad = !!(showErrors || touched[field.key]) && !!errs[field.key];

    switch (field.type) {
      case 'status':
        return <StatusField value={String(val ?? '')} onChange={setT} />;
      case 'region':
        return (
          <RegionField
            options={options.regions}
            value={String(val ?? '')}
            onChange={setT}
          />
        );
      case 'select':
        return <SelectField field={field} value={String(val ?? '')} onChange={setT} />;
      case 'toggle':
        return <ToggleField field={field} value={!!val} onChange={setT} />;
      case 'slots':
        return (
          <SlotsField
            value={(val as { filled: number; max: number }) ?? { filled: 0, max: 4 }}
            onChange={setT}
          />
        );
      case 'datetime':
        return (
          <DateTimeField
            value={(val as { dt: string; tz: string }) ?? { dt: '', tz: 'CET/CEST' }}
            onChange={setT}
          />
        );
      case 'worlddate':
        return (
          <WorldDateField
            value={
              (val as { cy: string; season: string; day: string }) ?? {
                cy: '',
                season: '',
                day: '',
              }
            }
            onChange={setT}
          />
        );
      case 'tags':
        return <TagField value={(val as string[]) ?? []} onChange={setT} />;
      case 'multiselect':
        return (
          <MultiSelectField
            field={field}
            value={(val as string[]) ?? []}
            onChange={setT}
          />
        );
      case 'regionmulti':
        return (
          <RegionMultiField
            options={options.regions}
            value={(val as string[]) ?? []}
            onChange={setT}
          />
        );
      case 'genretags':
        return (
          <GenreTagsField
            options={options.genres}
            value={(val as string[]) ?? []}
            onChange={setT}
          />
        );
      case 'stub':
        return <StubField field={field} />;
      case 'pairs':
        return <PairsField value={(val as [string, string][]) ?? []} onChange={setT} />;
      case 'textarea':
        return (
          <TextAreaField
            field={field}
            value={String(val ?? '')}
            onChange={setRaw}
            onCommit={() => commit(field)}
            bad={bad}
          />
        );
      case 'code':
        return (
          <TextField
            field={{ ...field, mono: true }}
            value={String(val ?? '')}
            onChange={setRaw}
            onCommit={() => commit(field)}
            bad={bad}
          />
        );
      default:
        return (
          <TextField
            field={field}
            value={String(val ?? '')}
            onChange={setRaw}
            onCommit={() => commit(field)}
            bad={bad}
          />
        );
    }
  };

  const summary = showErrors ? schema.filter((f) => errs[f.key]) : [];

  return (
    <div className="pf" data-component="PropertiesPanel">
      {summary.length > 0 ? (
        <div className="pf-summary">
          <strong>
            {summary.length} field{summary.length > 1 ? 's' : ''} need attention
          </strong>
          <ul>
            {summary.map((f) => (
              <li key={f.key}>
                {f.label} — {errs[f.key]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {schema.map((f) => {
        const show = (showErrors || touched[f.key]) && errs[f.key];
        const ok =
          touched[f.key] &&
          !errs[f.key] &&
          !fieldEmpty(f, values[f.key]) &&
          f.type !== 'toggle';
        return (
          <div key={f.key} className="pf-row" data-err={show ? 1 : 0}>
            <div className="pf-ic">{pfIcon(f.type)}</div>
            <div className="pf-label">
              {f.label}
              {f.required ? <span className="pf-req" title="Required" /> : null}
              {ok ? (
                <span className="pf-ok" title="Valid">
                  ✓
                </span>
              ) : null}
              {f.hint ? <span className="pf-hint">· {f.hint}</span> : null}
            </div>
            <div className="pf-val">
              {control(f)}
              {show ? <div className="pf-err">{errs[f.key]}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

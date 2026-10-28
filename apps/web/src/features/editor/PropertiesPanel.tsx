import { useEffect, useRef, useState } from 'react';
import { fieldEmpty, schemaErrors } from './editorValidation.js';
import {
  DateTimeField,
  GenreTagsField,
  MultiSelectField,
  PairsField,
  PointcrawlField,
  RegionField,
  RegionMultiField,
  SelectField,
  SeriesField,
  SlotsField,
  StatusField,
  StubField,
  TagField,
  TextAreaField,
  TextField,
  ToggleField,
  VoiceChannelField,
  WorldDateField,
} from './fields/FieldControls.js';
import type { EditorFieldOptions, EditorMeta, FieldSchema } from './types.js';
import type { PointcrawlLinkValue } from '../../components/domain/PointcrawlLinkPicker.js';

export function PropertiesPanel({
  schema,
  values,
  setValue,
  showErrors,
  focusRequest = 0,
  extraErrors = [],
  revealFilled = false,
  createMode = false,
  slugLocked = false,
  options,
  timeZone,
}: {
  schema: FieldSchema[];
  values: EditorMeta;
  setValue: (key: string, val: unknown) => void;
  showErrors: boolean;
  /** Changes on each blocked submit; the summary then takes focus and scrolls into view. */
  focusRequest?: number;
  /** Errors for inputs outside this panel (the quest description), listed in the summary. */
  extraErrors?: { key: string; label: string; message: string }[];
  /** Show errors on fields that already hold a value (a restored draft's bad numbers). */
  revealFilled?: boolean;
  /** A new record: a preselected default option gives way to the first other pick. */
  createMode?: boolean;
  slugLocked?: boolean;
  options: EditorFieldOptions;
  timeZone: string;
}): React.JSX.Element {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string): void =>
    setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const errs = schemaErrors(schema, values);
  const revealed = (f: FieldSchema): boolean =>
    showErrors || !!touched[f.key] || (revealFilled && !fieldEmpty(f, values[f.key]));

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
    const bad = revealed(field) && !!errs[field.key];

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
      case 'series':
        return (
          <SeriesField
            options={options.series}
            current={
              values.arc && typeof values.arc === 'object'
                ? (values.arc as { id: string; name: string })
                : undefined
            }
            value={String(val ?? '')}
            onChange={setT}
          />
        );
      case 'voicechannel':
        return (
          <VoiceChannelField
            options={options.voiceChannels}
            value={String(val ?? '')}
            onChange={setT}
          />
        );
      case 'pointcrawl':
        return (
          <PointcrawlField
            places={options.places}
            markVisited={true}
            value={Array.isArray(val) ? (val as PointcrawlLinkValue[]) : []}
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
            value={String(val ?? '')}
            timeZone={timeZone}
            label={field.label}
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
            replaceDefault={createMode}
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
            suggestions={field.suggestions ? options[field.suggestions] : undefined}
            value={String(val ?? '')}
            onChange={setRaw}
            onCommit={() => commit(field)}
            bad={bad}
          />
        );
    }
  };

  const summary = showErrors
    ? [
        ...schema
          .filter((f) => errs[f.key])
          .map((f) => ({ key: f.key, label: f.label, message: errs[f.key] })),
        ...extraErrors,
      ]
    : [];
  const summaryRef = useRef<HTMLDivElement>(null);
  const hasSummary = summary.length > 0;
  useEffect(() => {
    if (!focusRequest || !hasSummary) return;
    const node = summaryRef.current;
    node?.focus({ preventScroll: true });
    node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focusRequest, hasSummary]);

  return (
    <div className="pf" data-component="PropertiesPanel">
      {hasSummary ? (
        <div
          ref={summaryRef}
          className="pf-summary"
          data-el="editor.errorSummary"
          role="group"
          aria-label="Fields that need attention"
          tabIndex={-1}
        >
          <strong>
            {summary.length === 1
              ? '1 field needs attention'
              : `${summary.length} fields need attention`}
          </strong>
          <ul>
            {summary.map((f) => (
              <li key={f.key}>
                {f.label} — {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {schema.map((f) => {
        const show = revealed(f) && errs[f.key];
        const ok =
          touched[f.key] &&
          !errs[f.key] &&
          !fieldEmpty(f, values[f.key]) &&
          f.type !== 'toggle';
        return (
          <div key={f.key} className="pf-row" data-field={f.key} data-err={show ? 1 : 0}>
            <div className="pf-label">
              {f.label}
              {f.required ? <span className="pf-hint">Required</span> : null}
              {ok ? (
                <span className="pf-ok" title="Valid">
                  ✓
                </span>
              ) : null}
              {f.hint ? <span className="pf-hint">{f.hint}</span> : null}
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

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({
  label,
  error,
  children,
  ...input
}: {
  label: string;
  error?: string;
  children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field" data-invalid={error ? 'true' : 'false'}>
      <label htmlFor={id} className="type-caption">
        {label}
      </label>
      {children ?? (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...input}
        />
      )}
      {error ? (
        <p id={errorId} role="alert" className="type-caption">
          {error}
        </p>
      ) : null}
    </div>
  );
}

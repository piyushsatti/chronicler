import { cx } from './cx.js';

export type ColorSwatchProps = {
  colorVar: `--${string}`;
  label: string;
  className?: string;
};

/** Token-backed color chip — `colorVar` is a CSS custom-property name only. */
export function ColorSwatch({ colorVar, label, className }: ColorSwatchProps): React.JSX.Element {
  return (
    <span className={cx('color-swatch-wrap', className)} data-component="ColorSwatch">
      <span
        className="color-swatch"
        style={{ ['--swatch-color' as string]: `var(${colorVar})` }}
        role="img"
        aria-label={label}
      />
      <span className="type-caption">{label}</span>
    </span>
  );
}

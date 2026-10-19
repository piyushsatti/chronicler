interface ShortCodeBadgeProps {
  code: string;
  className?: string;
  onClick?: () => void;
}

export function ShortCodeBadge({ code, className, onClick }: ShortCodeBadgeProps) {
  const classes = `code ${className ?? ''}`.trim();

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {code}
      </button>
    );
  }

  return <span className={classes}>{code}</span>;
}

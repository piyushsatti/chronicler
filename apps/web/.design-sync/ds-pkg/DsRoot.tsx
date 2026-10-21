// Sync-only root wrapper for claude.ai/design previews and designs.
// Mirrors the attributes index.html's boot script sets on <html> and supplies
// the router context that Card (react-router Link) needs. Not app code.
import { useLayoutEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

export type DsRootProps = {
  /** Ruled theme: parchment (app default), midnight, ember, dracula, vegan. */
  theme?: 'parchment' | 'midnight' | 'ember' | 'dracula' | 'vegan';
  /** Colour mode. */
  mode?: 'dark' | 'light';
  /** Spacing density; scales every --sp-* token. */
  density?: 'comfortable' | 'compact';
  children?: ReactNode;
};

/** Root wrapper: sets the theme/mode/density attributes on <html>, paints the theme's page surface (bg, text colour, body font) and provides router context. Wrap every design in it. */
export function DsRoot({ theme = 'parchment', mode = 'dark', density = 'comfortable', children }: DsRootProps) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', mode);
    root.setAttribute('data-density', density);
    root.setAttribute('data-colorblind', 'off');
    root.setAttribute('data-bg-effect', 'none');
    root.setAttribute('data-motion-collapse', 'off');
  }, [theme, mode, density]);
  return (
    <MemoryRouter>
      <div
        data-ds-root=""
        style={{
          background: 'var(--color-bg-deep)',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          padding: 'var(--sp-4)',
        }}
      >
        {children}
      </div>
    </MemoryRouter>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import type { SiteDestination } from './destinations.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function HamburgerIcon(): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export type NavDrawerProps = {
  destinations: readonly SiteDestination[];
  /** Personal routes light up the avatar, so no destination is active. */
  personal?: boolean;
};

/** Medium / compact-height drawer nav — hamburger + focus-trapped panel. */
export function NavDrawer({
  destinations,
  personal = false,
}: NavDrawerProps): React.JSX.Element {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const close = useCallback((): void => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const trigger = hamburgerRef.current;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      trigger?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === firstEl || !panel.contains(active)) {
          event.preventDefault();
          lastEl.focus();
        }
      } else if (active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <div className="nav-drawer-root" data-nav-drawer>
      <button
        ref={hamburgerRef}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="nav-drawer"
        onClick={() => setOpen((prev) => !prev)}
        className="btn ghost nav-drawer-toggle"
      >
        <HamburgerIcon />
      </button>

      {open
        ? createPortal(
            <>
              <div
                data-testid="nav-drawer-backdrop"
                onClick={close}
                className="nav-drawer-backdrop"
                aria-hidden="true"
              />
              <div
                ref={panelRef}
                id="nav-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                className="nav-drawer-panel"
              >
                <h2 id={headingId} className="nav-drawer-title">
                  Main navigation
                </h2>
                <nav aria-label="Mobile navigation" className="nav-drawer-nav">
                  {destinations.map((destination) => {
                    const active = !personal && destination.matches(location.pathname);
                    return (
                      <Link
                        key={destination.id}
                        to={destination.href}
                        onClick={close}
                        aria-current={active ? 'page' : undefined}
                        className={`nav-drawer-link${active ? ' active' : ''}`}
                      >
                        {destination.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

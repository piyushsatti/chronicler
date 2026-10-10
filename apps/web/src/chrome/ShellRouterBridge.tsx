import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * ImpositionShell uses plain <a href>. Capture clicks in [data-shell-nav]
 * so same-origin paths stay in the SPA.
 */
export function ShellRouterBridge({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        !anchor.closest('[data-shell-nav]') &&
        !anchor.closest('[data-site-chrome]')
      ) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http')) return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  return <>{children}</>;
}

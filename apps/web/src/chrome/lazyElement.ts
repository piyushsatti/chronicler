import {
  createElement,
  lazy,
  Suspense,
  type ComponentType,
  type ReactElement,
} from 'react';

/**
 * Route element that loads a page on navigation.
 * Dynamic import keeps feature.ts from pulling pages (and their query-key
 * imports) in while the registry is still initializing.
 */
export function lazyElement(
  load: () => Promise<{ default: ComponentType }>,
): ReactElement {
  const Page = lazy(load);
  return createElement(
    Suspense,
    {
      fallback: createElement(
        'p',
        { className: 'state-loading', role: 'status' },
        'Loading…',
      ),
    },
    createElement(Page),
  );
}

import {
  createElement,
  Suspense,
  type ComponentType,
  type ReactElement,
} from 'react';
import { lazyWithReload } from './lazyWithReload.js';

/**
 * Route element that loads a page on navigation with stale-chunk recovery.
 */
export function lazyElement(
  load: () => Promise<{ default: ComponentType }>,
): ReactElement {
  const Page = lazyWithReload(load);
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

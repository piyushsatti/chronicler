import { createElement, Suspense, type ComponentType, type ReactElement } from 'react';
import { PageShell } from '../components/foundation/PageShell.js';
import { Skeleton } from '../components/primitives/Skeleton.js';
import { lazyWithReload } from './lazyWithReload.js';

/** Route-chunk placeholder: sits in the page gutter like the page it stands for. */
function RouteLoading(): ReactElement {
  return createElement(
    PageShell,
    null,
    createElement(Skeleton, {
      width: '16rem',
      height: '2.25rem',
      'aria-label': 'Loading page',
    }),
    createElement(Skeleton, { height: '12rem', 'aria-label': 'Loading page content' }),
  );
}

/**
 * Route element that loads a page on navigation with stale-chunk recovery.
 */
export function lazyElement(
  load: () => Promise<{ default: ComponentType }>,
): ReactElement {
  const Page = lazyWithReload(load);
  return createElement(
    Suspense,
    { fallback: createElement(RouteLoading) },
    createElement(Page),
  );
}

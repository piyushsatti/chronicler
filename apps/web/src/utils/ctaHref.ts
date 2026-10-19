export type CtaHrefResolution =
  | { kind: 'internal'; to: string }
  | { kind: 'external'; href: string };

const EXTERNAL_SCHEME_ALLOWLIST = new Set(['http:', 'https:']);

export function resolveCtaHref(href: string): CtaHrefResolution {
  if (typeof href !== 'string' || href.length === 0) {
    return { kind: 'internal', to: href ?? '' };
  }
  try {
    const parsed = new URL(href, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return { kind: 'internal', to: `${parsed.pathname}${parsed.search}${parsed.hash}` };
    }
    if (EXTERNAL_SCHEME_ALLOWLIST.has(parsed.protocol)) {
      return { kind: 'external', href: parsed.href };
    }
    return { kind: 'internal', to: href };
  } catch {
    return { kind: 'internal', to: href };
  }
}

export function navigateToCtaHref(navigate: (to: string) => void, href: string): void {
  const resolved = resolveCtaHref(href);
  if (resolved.kind === 'internal') {
    navigate(resolved.to);
  } else {
    window.location.assign(resolved.href);
  }
}

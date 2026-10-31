// @vitest-environment node
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';
import vercel from '../../vercel.json';

const backendRoutes = [
  { method: 'GET', pathname: '/auth/discord' },
  { method: 'POST', pathname: '/auth/discord/callback' },
];

describe('backend auth proxy and SPA callback boundary', () => {
  it('proxies both declared backend auth routes while leaving the SPA callback to Vite', async () => {
    const config =
      typeof viteConfig === 'function'
        ? await viteConfig({ command: 'serve', mode: 'test' })
        : await viteConfig;
    const proxy = config.server?.proxy ?? {};
    expect(Object.keys(proxy).sort()).toEqual(['/auth/discord', '/v1']);
    for (const route of backendRoutes)
      expect(
        Object.keys(proxy).some((prefix) => route.pathname.startsWith(prefix)),
        route.method,
      ).toBe(true);
    expect(
      Object.keys(proxy).some((prefix) => '/auth/callback'.startsWith(prefix)),
    ).toBe(false);
  });

  it('keeps both production backend rewrites before the SPA fallback without capturing its callback', () => {
    const backend = 'https://chronicler-prod-api.piyushsatti.com';
    expect(
      vercel.rewrites.filter((rewrite) => rewrite.source.startsWith('/auth/')),
    ).toEqual([
      { source: '/auth/discord', destination: `${backend}/auth/discord` },
      { source: '/auth/discord/:path*', destination: `${backend}/auth/discord/:path*` },
    ]);
    expect(vercel.rewrites.at(-1)).toEqual({
      source: '/(.*)',
      destination: '/index.html',
    });
    expect(
      vercel.rewrites.some(
        (rewrite) =>
          rewrite.source === '/auth/callback' || rewrite.source === '/auth/:path*',
      ),
    ).toBe(false);
  });
});

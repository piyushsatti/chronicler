import { test as base, expect, type Page, type Request } from '@playwright/test';
import { getOperationAST, parse } from 'graphql';
import { z } from 'zod';

const requestBody = z.object({
  query: z.string(),
  operationName: z.string().nullish(),
});
const graphqlResult = z.object({
  errors: z
    .array(
      z.object({
        extensions: z.object({ code: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

const test = base.extend<{ readOnlyNetwork: () => Promise<void> }>({
  readOnlyNetwork: [
    async ({ page, context }, use, testInfo) => {
      const unsafe: string[] = [];
      const failures: string[] = [];
      const pageErrors: string[] = [];
      const operations: string[] = [];
      const pending = new Map<Request, string>();
      const checks = new Set<Promise<void>>();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/mockServiceWorker|\/auth\/discord(?:\/|$)/.test(pathname))
          unsafe.push(pathname);
        if (!pathname.startsWith('/v1/')) return;
        if (request.method() === 'POST' && pathname === '/v1/graphql') {
          pending.set(request, 'unparsed GraphQL request');
          const body = requestBody.safeParse(request.postDataJSON());
          if (!body.success) {
            unsafe.push('invalid GraphQL request');
            return;
          }
          const operation = getOperationAST(
            parse(body.data.query),
            body.data.operationName,
          );
          if (operation?.operation !== 'query')
            unsafe.push('non-query GraphQL operation');
          const name = operation?.name?.value ?? 'anonymous query';
          pending.set(request, name);
          operations.push(name);
        } else if (request.method() !== 'GET')
          unsafe.push(`${request.method()} ${pathname}`);
      });
      page.on('requestfinished', (request) => pending.delete(request));
      page.on('requestfailed', (request) => {
        const name = pending.get(request);
        if (name === undefined) return;
        pending.delete(request);
        failures.push(`${name} request failed: ${request.failure()?.errorText}`);
      });
      page.on('response', (response) => {
        const pathname = new URL(response.url()).pathname;
        if (response.fromServiceWorker()) unsafe.push(`service worker: ${pathname}`);
        if (pathname !== '/v1/graphql') return;
        const name = pending.get(response.request()) ?? 'untracked GraphQL request';
        const check = (async () => {
          if (!response.ok()) {
            failures.push(`GraphQL HTTP ${response.status()}`);
            return;
          }
          const result = graphqlResult.parse(await response.json());
          for (const error of result.errors ?? [])
            failures.push(error.extensions?.code ?? 'GraphQL error');
        })()
          .catch((error: unknown) => {
            failures.push(`${name} response inspection failed: ${String(error)}`);
          })
          .finally(() => checks.delete(check));
        checks.add(check);
      });
      const settle = async (): Promise<void> => {
        await expect
          .poll(() => ({ pending: [...pending.values()], readers: checks.size }), {
            timeout: 10_000,
            message: 'GraphQL requests and consumed response checks must settle',
          })
          .toEqual({ pending: [], readers: 0 });
        expect(unsafe).toEqual([]);
        expect(failures).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(context.serviceWorkers()).toHaveLength(0);
      };
      await use(settle);
      try {
        await settle();
      } finally {
        await testInfo.attach('guest-live-checks', {
          body: JSON.stringify(
            {
              frontend: testInfo.config.metadata.frontend,
              api: testInfo.config.metadata.api,
              origin: testInfo.project.use.baseURL,
              operations,
              pending: [...pending.values()],
              responseReaders: checks.size,
              unsafe,
              failures,
              pageErrors,
              finalPath: new URL(page.url()).pathname,
              mocks: false,
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],
});

async function paintedPage(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-site-chrome]')).toBeVisible();
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const bounds = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport!.width + 1);
}

for (const route of [
  '/',
  '/quests',
  '/characters',
  '/players',
  '/dms',
  '/codex',
  '/factions',
  '/npcs',
  '/regions',
  '/map',
  '/chronicles',
  '/community',
  '/rules',
  '/welcome',
  '/calendar',
  '/search',
  '/login',
  '/settings',
  '/me/personalize',
]) {
  test(`guest reads ${route}`, async ({ page, readOnlyNetwork }, testInfo) => {
    await readOnlyNetwork();
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await paintedPage(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('route.png') });
  });
}

for (const [from, to] of [
  ['/quests/open', '/quests'],
  ['/timeline', '/chronicles'],
  ['/schedule', '/calendar'],
  ['/guilds', '/codex'],
]) {
  test(`guest alias ${from} converges on ${to}`, async ({ page, readOnlyNetwork }) => {
    await readOnlyNetwork();
    await page.goto(from);
    await expect(page).toHaveURL((url) => url.pathname === to);
    await paintedPage(page);
  });
}

for (const route of [
  '/gallery',
  '/me',
  '/notifications',
  '/dm',
  '/admin',
  '/admin/people',
  '/admin/characters',
  '/admin/review',
  '/admin/world',
  '/admin/content',
  '/admin/delivery',
  '/admin/data-health',
  '/admin/overview',
  '/admin/members',
  '/admin/home-banner',
  '/admin/regions',
  '/admin/world-clock',
  '/admin/catalogs',
  '/admin/ingestion',
  '/verify',
]) {
  test(`guest is redirected from ${route}`, async ({ page, readOnlyNetwork }) => {
    await readOnlyNetwork();
    await page.goto(route);
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-layout="admin-workspace"], [data-el="notifications.list"], [data-el^="gallery.demo."]',
      ),
    ).toHaveCount(0);
  });
}

test('unmapped historical identities explain the boundary without guessing', async ({
  page,
  readOnlyNetwork,
}) => {
  await readOnlyNetwork();
  await page.goto('/regions/kept-tower');
  await expect(
    page.getByText(
      'This older Region link has no current Region identifier. Choose a region from the directory.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Browse regions', exact: true }),
  ).toHaveAttribute('href', '/regions');
  await readOnlyNetwork();
  await page.goto('/series/not-an-arc-uuid');
  await expect(
    page.getByText(
      'This historical series code has no current UUID identity. Open a series from its quest’s arc link to continue.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Browse quests', exact: true }),
  ).toHaveAttribute('href', '/quests');
});

test('missing route and invalid callback show recoverable errors without OAuth', async ({
  page,
  request,
  readOnlyNetwork,
}) => {
  await readOnlyNetwork();
  await page.goto('/this-route-does-not-exist-qa');
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible();
  await readOnlyNetwork();
  const callback = await page.goto('/auth/callback');
  expect(callback?.status()).toBe(200);
  await expect(page.getByRole('alert')).toContainText(
    'We couldn’t verify this sign-in. The link may be old or opened in another tab.',
  );
  const rejected = await request.post('/auth/discord/callback', { data: {} });
  expect(rejected.status()).toBe(422);
  expect(await rejected.json()).toMatchObject({ code: 'INVALID' });
});

test('Search loads a populated second page and retains URL state through a real reader', async ({
  page,
  readOnlyNetwork,
}) => {
  await readOnlyNetwork();
  await page.goto('/search?q=tower');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Search', exact: true }),
  ).toBeVisible();
  const documents = page.getByRole('region', { name: 'Documents', exact: true });
  await expect(
    documents.getByRole('button', { name: 'Next documents', exact: true }),
  ).toBeEnabled();
  const before = await documents
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  await documents.getByRole('button', { name: 'Next documents', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('documents') === '2' &&
      url.searchParams.get('q') === 'tower',
  );
  await expect(
    documents.getByRole('button', { name: 'Previous documents', exact: true }),
  ).toBeEnabled();
  const link = documents
    .getByRole('link')
    .filter({ hasNotText: 'Browse quests' })
    .first();
  await expect(link).toBeVisible();
  const title = (await link.innerText()).trim();
  expect(title).not.toBe('');
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  expect(before).not.toContain(href);
  await readOnlyNetwork();
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === href);
  await expect(
    page.getByRole('heading', { level: 1, name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await paintedPage(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await readOnlyNetwork();
  await page.goBack();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('documents') === '2' &&
      url.searchParams.get('q') === 'tower',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Search', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      documents
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    )
    .toContain(href);
  await documents
    .getByRole('button', { name: 'Previous documents', exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      !url.searchParams.has('documents') && url.searchParams.get('q') === 'tower',
  );
});

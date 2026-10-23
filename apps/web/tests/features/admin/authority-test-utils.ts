import { http, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { featureGraphql } from '../../../src/chrome/featureRegistry.js';
import type { GraphqlRequestBody } from '../../../src/chrome/featureModule.js';
import { server } from '../../../src/mocks/server.js';
import goodMe from '../../fixtures/wire/me/good.json';

export function graphqlOperationName(query: string | undefined): string | null {
  const m = (query ?? '').match(/\b(query|mutation)\s+(\w+)/);
  return m?.[2] ?? null;
}

type MePayload = typeof goodMe & { roles: string[] };

function accessProbe(name: string | null, account: unknown): Response | null {
  if (name !== 'CurrentAdminAccess' && name !== 'CurrentReviewAccess') return null;
  const roles =
    account &&
    typeof account === 'object' &&
    'roles' in account &&
    Array.isArray(account.roles)
      ? account.roles
      : [];
  const allowed =
    name === 'CurrentAdminAccess'
      ? roles.includes('admin')
      : roles.includes('admin') || roles.includes('verifier');
  return allowed
    ? HttpResponse.json({
        data:
          name === 'CurrentAdminAccess'
            ? { adminOperations: { activeAlertCount: 0 } }
            : { pendingDmProfileVerifications: { total: 0 } },
      })
    : HttpResponse.json({
        errors: [{ message: 'Not permitted', extensions: { code: 'FORBIDDEN' } }],
      });
}

function dispatchFeatureGraphql(body: GraphqlRequestBody) {
  const name = graphqlOperationName(body.query);
  if (name && featureGraphql[name]) {
    return featureGraphql[name](body);
  }
  return HttpResponse.json({
    errors: [{ message: 'Unhandled operation', extensions: { code: 'UNHANDLED' } }],
  });
}

/** Dual-mock account loads: REST /v1/members/me (HEAD) + GraphQL MemberMe (Wave A). */
export function mockMemberMe(
  respond: () => Response | Promise<Response>,
  graphqlData?: () => unknown | Promise<unknown>,
) {
  server.use(
    http.get('/v1/members/me', async () => respond()),
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = (await request.json()) as GraphqlRequestBody;
      if (graphqlOperationName(body.query) === 'MemberMe') {
        if (graphqlData) {
          const data = await graphqlData();
          return HttpResponse.json({ data: { memberMe: data } });
        }
        const restResponse = await respond();
        if (!restResponse.ok) {
          const code =
            restResponse.status === 401
              ? 'UNAUTHORIZED'
              : restResponse.status === 403
                ? 'FORBIDDEN'
                : 'INTERNAL';
          return HttpResponse.json(
            {
              errors: [
                {
                  message: 'account failure',
                  extensions: { code },
                },
              ],
            },
            // Preserve HTTP 401 so graphqlRequest ends the session the same way a
            // gateway challenge would (status checked after errors[]).
            { status: restResponse.status === 401 ? 401 : 200 },
          );
        }
        const payload = await restResponse.json();
        return HttpResponse.json({ data: { memberMe: payload } });
      }
      const probeName = graphqlOperationName(body.query);
      if (probeName === 'CurrentAdminAccess' || probeName === 'CurrentReviewAccess') {
        const account = graphqlData
          ? await graphqlData()
          : await (await respond()).json();
        const probe = accessProbe(probeName, account);
        if (probe) return probe;
      }
      return dispatchFeatureGraphql(body);
    }),
  );
}

/**
 * Override GraphQL for named ops while keeping MemberMe (and other feature ops) healthy.
 * Needed when blanket GraphQL error mocks would starve account validation.
 */
export function mockGraphqlOps(
  overrides: Record<string, (body: GraphqlRequestBody) => Response | Promise<Response>>,
  me?: MePayload,
) {
  const account = me ?? { ...goodMe, roles: ['admin'] };
  server.use(
    http.get('/v1/members/me', () => HttpResponse.json(account)),
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = (await request.json()) as GraphqlRequestBody;
      const name = graphqlOperationName(body.query);
      if (name === 'MemberMe') {
        return HttpResponse.json({ data: { memberMe: account } });
      }
      if (name && overrides[name]) {
        return overrides[name](body);
      }
      const probe = accessProbe(name, account);
      return probe ?? dispatchFeatureGraphql(body);
    }),
  );
}

export function signIn(roles: string[] = ['admin'], tokenRoles: string[] = []) {
  const token = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({
      sub: 'discord-test',
      exp: Math.floor(Date.now() / 1000) + 3600,
      roles: tokenRoles,
    }),
  )}.test`;
  localStorage.setItem(TOKEN_KEY, token);
  const me: MePayload = { ...goodMe, roles };
  mockMemberMe(
    () => HttpResponse.json(me),
    () => me,
  );
}

export function trackPrivilegedRequests() {
  const requested: string[] = [];
  const record = async ({ request }: { request: Request }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/v1/members/me') return;
    if (pathname === GRAPHQL_PATH) {
      try {
        const clone = request.clone();
        const body = (await clone.json()) as { query?: string };
        if (
          // Authority reads, not privileged data: the member, the server proofs,
          // and the DM-profile read behind LiveDM create gates.
          [
            'MemberMe',
            'CurrentAdminAccess',
            'CurrentReviewAccess',
            'QuestAuthoringAuthority',
          ].includes(graphqlOperationName(body.query) ?? '')
        )
          return;
      } catch {
        // ignore unreadable bodies
      }
    }
    requested.push(pathname);
  };
  server.events.on('request:start', record);
  return {
    requested,
    stop: () => server.events.removeListener('request:start', record),
  };
}

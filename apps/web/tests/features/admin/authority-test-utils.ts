import { http, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
import goodMe from '../../fixtures/wire/me/good.json';

export function signIn(roles: string[] = ['admin'], tokenRoles: string[] = []) {
  const token = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({
      sub: 'discord-test',
      exp: Math.floor(Date.now() / 1000) + 3600,
      roles: tokenRoles,
    }),
  )}.test`;
  localStorage.setItem(TOKEN_KEY, token);
  server.use(http.get('/v1/members/me', () => HttpResponse.json({ ...goodMe, roles })));
}

export function trackPrivilegedRequests() {
  const requested: string[] = [];
  const record = ({ request }: { request: Request }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/v1/members/me') requested.push(pathname);
  };
  server.events.on('request:start', record);
  return {
    requested,
    stop: () => server.events.removeListener('request:start', record),
  };
}

import { graphql, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
export const profileActor = {
  id: '11111111-1111-4111-8111-111111111111',
  handle: 'mira',
  displayName: 'Mira',
  roles: ['player', 'dm'],
};
export function profileToken(
  subject = 'profile-first',
  expires = Date.now() + 3600000,
) {
  return `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({ sub: subject, exp: Math.floor(expires / 1000) }),
  )}.test`;
}
export function signInProfile() {
  localStorage.setItem(TOKEN_KEY, profileToken());
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({ data: { memberMe: profileActor } }),
    ),
  );
}

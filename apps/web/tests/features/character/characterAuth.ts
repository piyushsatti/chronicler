import { graphql, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
export const characterActor = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  handle: 'owner',
  displayName: 'Owner',
  roles: ['player'],
};
export function characterToken(
  subject = 'character-first',
  expires = Date.now() + 3600000,
) {
  return `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({ sub: subject, exp: Math.floor(expires / 1000) }),
  )}.test`;
}
export function signInCharacter(actor = characterActor) {
  localStorage.setItem(TOKEN_KEY, characterToken());
  server.use(
    graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: actor } })),
  );
}

import { LoginPage } from './LoginPage.js';

/** Route element for /login. Signed-in members are redirected to /me by LoginPage. */
export function LoginRoute(): React.JSX.Element {
  return <LoginPage />;
}

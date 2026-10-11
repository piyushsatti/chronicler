import { LoginPage } from '../features/member/pages/LoginPage.js';
import { LoginNotificationsPanel } from '../features/notifications/components/LoginNotificationsPanel.js';
import { useAuth } from '../auth/AuthContext.js';

/** Composes member login with notifications without a cross-feature import. */
export function LoginRoute(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return (
    <LoginPage
      notificationsSlot={
        isAuthenticated ? <LoginNotificationsPanel enabled /> : null
      }
    />
  );
}

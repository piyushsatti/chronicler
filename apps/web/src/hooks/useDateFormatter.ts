import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { usePersonalization } from './usePersonalizePage.js';
import { formatInstant, formatScheduled, formatScheduledShort } from '../utils/format.js';

export function useDateFormatter() {
  const { isAuthenticated } = useAuth();
  const {
    prefs: { timezone: deviceTimezone },
  } = useTheme();
  const { data, isSuccess } = usePersonalization();
  const timezone =
    isAuthenticated && isSuccess ? data.timezone : deviceTimezone;
  return useMemo(
    () => ({
      timeZone: timezone,
      formatDate: (value: string | null | undefined) =>
        formatInstant(value, timezone, 'date'),
      formatDateTime: (value: string | null | undefined) =>
        formatInstant(value, timezone),
      formatScheduled: (value: string | null | undefined) =>
        formatScheduled(value, timezone),
      formatScheduledShort: (value: string | null | undefined) =>
        formatScheduledShort(value, timezone),
    }),
    [timezone],
  );
}

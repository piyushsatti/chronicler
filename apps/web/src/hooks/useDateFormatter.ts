import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.js';
import { formatInstant, formatScheduled, formatScheduledShort } from '../utils/format.js';
export function useDateFormatter() {
  const {
    prefs: { timezone },
  } = useTheme();
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

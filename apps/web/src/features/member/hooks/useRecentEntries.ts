import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { useProfileActivity } from '../../../hooks/useProfileActivity.js';
import { isSentinelDate } from '../../../utils/format.js';
import { formatRelativeDate } from '../memberFormat.js';
import type { MemberHub } from './useMemberHub.js';

export type RecentEntry = { key: string; title: string; href?: string; meta: string };
export type RecentState = { status: 'loading' } | { status: 'error'; retry: () => void; error: AppError } | { status: 'ready'; entries: RecentEntry[] };

/** The member's published summaries (newest first); falls back to hub session history when they have written none. */
export function useRecentEntries(memberId: string, data: MemberHub): RecentState {
  const { activity } = useProfileActivity(memberId);
  if (activity.isError) return { status: 'error', error: toAppError(activity.error, 'me:activity'), retry: () => void activity.refetch() };
  if (!activity.data) return { status: 'loading' };
  const writings = [...activity.data.writings]
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 5)
    .map((entry): RecentEntry => {
      const when = entry.publishedAt && !isSentinelDate(entry.publishedAt) ? formatRelativeDate(entry.publishedAt) : null;
      return { key: entry.id, title: `${entry.title} — Summary`, href: `/summaries/${entry.slug}`, meta: when ? `Written ${when}` : 'Summary' };
    });
  if (writings.length > 0) return { status: 'ready', entries: writings };
  const sessions = data.hub.status === 'ready' ? data.hub.data.recentSessions : [];
  return {
    status: 'ready',
    entries: sessions.map((session, index) => ({
      key: `${session.occurredAt}-${index}`,
      title: session.kind,
      meta: formatRelativeDate(session.occurredAt) ?? '',
    })),
  };
}

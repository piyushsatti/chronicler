import { useMe } from './useMe.js';

export type MemberLinkTarget = {
  memberId?: string | null;
  handle: string;
};

export type MemberHref = (member: MemberLinkTarget, kind: 'dm' | 'player') => string;

/** Link for a member card, row or name. The signed-in viewer's own entry goes to
 * the personal hub (/me), never to their public profile (round 3, L6). Shared so
 * every feature applies the same rule without cross-feature imports. */
export function useMemberHref(): MemberHref {
  const me = useMe().data;
  return (member, kind) => {
    const handle = member.handle.replace(/^@/, '');
    // Prefer the id; the handle covers views that carry only the handle.
    const isSelf =
      me !== undefined &&
      (member.memberId
        ? member.memberId === me.id
        : handle.toLowerCase() === String(me.handle).toLowerCase());
    if (isSelf) return '/me';
    return `${kind === 'dm' ? '/dms' : '/players'}/@${encodeURIComponent(handle)}`;
  };
}

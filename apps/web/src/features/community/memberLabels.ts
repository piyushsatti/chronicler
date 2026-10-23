import { personLabels, personName, type PersonLike } from '../../utils/format.js';

/** Labels for a visible list of members (D-names): display name, or "Name (@handle)"
 * when the name is generic or shared. Look a member up by the same object. */
export function memberLabeler<T extends PersonLike>(
  members: readonly T[],
): (member: T) => string {
  const labels = personLabels(members);
  const byMember = new Map<T, string>(
    members.map((member, index) => [member, labels[index] ?? '']),
  );
  return (member) => byMember.get(member) ?? personName(member);
}

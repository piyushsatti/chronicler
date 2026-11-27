import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { ProfileOwnerActions } from './ProfileOwnerActions.js';
import type { MemberViewModel } from '../../../view-models/member.js';

/**
 * The profile editor (availability form focused) opened on /me by `?edit=availability`.
 * The member feature reaches it through `featureParts`, not by importing profile. Closing
 * removes the param; saving keeps the editor open, as on the public profile page.
 */
export function MeAvailabilityEditor({ me }: { me: MemberViewModel }): React.JSX.Element {
  const [, setEdit] = useUrlParam('edit');
  const profile = useMemberProfile(me.handle);
  if (profile.isError) return <StatePanel variant="inline" status="error" error={toAppError(profile.error, 'me:availability')} />;
  if (!profile.data) return <StatePanel variant="inline" status="loading" />;
  return (
    <Card as="section" pad={4} className="stack" aria-label="Edit your availability">
      <div className="row" data-justify="end">
        <Button variant="secondary" size="sm" onClick={() => setEdit('')}>Close editor</Button>
      </div>
      <ProfileOwnerActions
        key={profile.data.member.id}
        profile={profile.data}
        canAvailability={me.roles.includes('guest') || me.roles.includes('player') || me.roles.includes('admin')}
        canDm={me.roles.includes('dm') || me.roles.includes('admin')}
        focusAvailability
      />
    </Card>
  );
}

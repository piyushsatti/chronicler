import { useMemberProfile } from '../../../hooks/useMemberProfile.js';

/** The quest DM's house rules, read from their DM profile. Idle until `enabled`
 * (the Table Rules tab is open) so the profile is not fetched for every visit. */
export function useQuestTableRules(dmHandle: string | null, enabled: boolean) {
  const profile = useMemberProfile(enabled ? (dmHandle ?? '') : '');
  return {
    isPending: profile.isPending,
    error: profile.isError ? profile.error : null,
    houseRules: profile.data?.dmProfile?.houseRules?.trim() ?? '',
    retry: () => {
      void profile.refetch();
    },
  };
}

import { z } from 'zod';
import type {
  ProfileUpdateMyProfileMutation,
  ProfileUpdateMyProfileMutationVariables,
  ProfileSetMyAvailabilityMutation,
  ProfileUpdateMyDmProfileMutation,
  ProfileSubmitDmProfileMutation,
  ProfileSetMyAvailabilityMutationVariables,
  ProfileUpdateMyDmProfileMutationVariables,
  ProfileSubmitDmProfileMutationVariables,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { TransportError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import PROFILE from './profileUpdateMyProfile.graphql?raw';
import AVAILABILITY from './profileSetMyAvailability.graphql?raw';
import DM from './profileUpdateMyDmProfile.graphql?raw';
import SUBMIT from './profileSubmitDmProfile.graphql?raw';

type DmFields = Pick<
  ProfileUpdateMyDmProfileMutationVariables['input'],
  'tagline' | 'philosophy' | 'houseRules' | 'tableInfo' | 'acceptingPlayers'
>;
export type ProfileCommand =
  | {
      kind: 'profile';
      memberId: string;
      input: ProfileUpdateMyProfileMutationVariables['input'];
    }
  | {
      kind: 'availability';
      memberId: string;
      slots: ProfileSetMyAvailabilityMutationVariables['slots'];
    }
  | { kind: 'dm'; memberId: string; input: DmFields }
  | { kind: 'submit'; memberId: string; expectedRevision: number };
const memberReceipt = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
const dmReceipt = z.object({
  memberId: z.string().uuid(),
  status: z.string(),
  reviewRevision: z.number().int().positive(),
});
const slotsReceipt = z.array(
  z.object({
    day: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    note: z.string().nullable(),
  }),
);
export async function writeProfileCommand(
  command: ProfileCommand,
  key: string,
): Promise<string> {
  try {
    const meta = { idempotencyKey: key };
    switch (command.kind) {
      case 'profile': {
        const variables: ProfileUpdateMyProfileMutationVariables = {
          input: command.input,
          meta,
        };
        const data = await graphqlRequest<ProfileUpdateMyProfileMutation>(
          PROFILE,
          variables,
        );
        memberReceipt.parse(data.updateMyProfile);
        return 'Profile saved.';
      }
      case 'availability': {
        const variables: ProfileSetMyAvailabilityMutationVariables = {
          slots: command.slots,
          meta,
        };
        const data = await graphqlRequest<ProfileSetMyAvailabilityMutation>(
          AVAILABILITY,
          variables,
        );
        slotsReceipt.parse(data.setMyAvailability);
        return 'Availability saved.';
      }
      case 'dm': {
        const variables: ProfileUpdateMyDmProfileMutationVariables = {
          input: command.input,
          meta,
        };
        const data = await graphqlRequest<ProfileUpdateMyDmProfileMutation>(
          DM,
          variables,
        );
        dmReceipt.parse(data.updateMyDmProfile);
        return 'DM profile saved as draft. Submit it for review.';
      }
      case 'submit': {
        const variables: ProfileSubmitDmProfileMutationVariables = {
          expectedRevision: command.expectedRevision,
          meta,
        };
        const data = await graphqlRequest<ProfileSubmitDmProfileMutation>(
          SUBMIT,
          variables,
        );
        dmReceipt.parse(data.submitDmProfileForVerification);
        return 'Submitted for verification.';
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError)
      throw toAppError({ failure: 'InvalidWire' }, 'profile:write');
    if (error instanceof TransportError && error.code === 'INVALID') {
      throw {
        ...toAppError(error, 'profile:write'),
        userMessage:
          command.kind === 'availability'
            ? 'Check the availability windows. Use valid days and 24-hour times, and keep windows on the same day from overlapping.'
            : command.kind === 'profile'
              ? 'Enter a display name and an HTTPS avatar URL, or clear the avatar field.'
              : 'Check the DM profile fields and reload its current revision.',
      };
    }
    const app = toAppError(error, 'profile:write');
    if (error instanceof TransportError && error.code === 'CONFLICT')
      throw {
        ...app,
        userMessage:
          'This profile changed. Reload it before submitting the current revision.',
      };
    throw app;
  }
}

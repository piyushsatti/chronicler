import { beforeEach, describe, it, expect } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileOwnerActions } from '../../../src/features/profile/components/ProfileOwnerActions.js';
import { parseMemberProfile } from '../../../src/features/profile/adapters/memberProfileAdapter.js';
import { server } from '../../../src/mocks/server.js';
import wire from '../../fixtures/wire/profile/member-profile-good.json';
import { renderWithProviders } from '../../test-utils.js';
import { signInProfile } from './profileAuth.js';
beforeEach(signInProfile);
function profile() {
  const parsed = parseMemberProfile(wire);
  if (!parsed.ok || !parsed.data) throw Error('Bad fixture');
  return parsed.data;
}
describe('Profile owner writes', () => {
  it('keeps the selected weekday value when saving availability', async () => {
    let slots: unknown;
    server.use(graphql.mutation('ProfileSetMyAvailability', ({ variables }) => {
      slots = variables.slots;
      return HttpResponse.json({ data: { setMyAvailability: variables.slots } });
    }));
    const user = userEvent.setup();
    renderWithProviders(<ProfileOwnerActions profile={profile()} canAvailability canDm={false} />);
    await user.click(screen.getByRole('button', { name: /^Day 1 / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Tuesday' }));
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    await screen.findByText('Availability saved.');
    expect(slots).toEqual([{ ...wire.availability[0], day: 'TUESDAY' }]);
  });
  it('keeps day, start, and end on one wrapping row and round-trips an end of 24:00', async () => {
    let slots: unknown;
    server.use(graphql.mutation('ProfileSetMyAvailability', ({ variables }) => {
      slots = variables.slots;
      return HttpResponse.json({ data: { setMyAvailability: variables.slots } });
    }));
    const current = profile();
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileOwnerActions
        profile={{
          ...current,
          availability: [{ ...current.availability[0], endTime: '24:00:00' }],
        }}
        canAvailability
        canDm={false}
      />,
    );
    const start = screen.getByLabelText('Start time 1');
    const end = screen.getByLabelText('End time 1');
    const row = start.closest('.row');
    expect(row).toHaveAttribute('data-wrap', '1');
    expect(row).toContainElement(end);
    expect(row).toContainElement(screen.getByRole('button', { name: /^Day 1 / }));
    expect(row).not.toContainElement(screen.getByLabelText('Availability note 1'));
    expect(start).toHaveAttribute('type', 'time');
    expect(start).toHaveValue('18:00');
    expect(end).toHaveValue('24:00');
    expect(end).not.toHaveAttribute('type', 'time');
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    await screen.findByText('Availability saved.');
    expect(slots).toEqual([{ ...current.availability[0], endTime: '24:00:00' }]);
  });
  it('omits an untouched avatar and explicitly clears a removed one', async () => {
    const attempts: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('ProfileUpdateMyProfile', ({ variables }) => {
        attempts.push(variables);
        return HttpResponse.json({
          data: {
            updateMyProfile: {
              id: wire.member.id,
              displayName: 'Saved',
              avatarUrl: null,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileOwnerActions
        profile={{
          ...profile(),
          member: { ...profile().member, avatarUrl: 'https://example.test/avatar.png' },
        }}
        canAvailability
        canDm
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved.');
    expect(attempts[0]?.input).not.toHaveProperty('avatarUrl');
    await user.clear(screen.getByRole('textbox', { name: 'Avatar URL' }));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved.');
    expect(attempts[1]?.input).toMatchObject({ avatarUrl: null });
  });
  it('sends the complete loaded DM replacement, including opaque table info, and submits the current saved revision', async () => {
    const attempts: Record<string, unknown>[] = [];
    let submitted: unknown;
    server.use(
      graphql.mutation('ProfileUpdateMyDmProfile', ({ variables }) => {
        attempts.push(variables);
        return HttpResponse.json({
          data: {
            updateMyDmProfile: {
              memberId: wire.member.id,
              status: 'draft',
              reviewRevision: 2,
            },
          },
        });
      }),
      graphql.mutation('ProfileSubmitDmProfile', ({ variables }) => {
        submitted = variables;
        return HttpResponse.json({
          data: {
            submitDmProfileForVerification: {
              memberId: wire.member.id,
              status: 'pending',
              reviewRevision: 2,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    const view = renderWithProviders(
      <ProfileOwnerActions profile={profile()} canAvailability canDm />,
    );
    await user.clear(screen.getByRole('textbox', { name: 'Tagline' }));
    await user.click(screen.getByRole('button', { name: 'Save DM profile' }));
    await screen.findByText(/DM profile saved as draft/);
    expect(attempts[0]?.input).toEqual({
      tagline: null,
      philosophy: wire.dmProfile.philosophy,
      houseRules: wire.dmProfile.houseRules,
      tableInfo: wire.dmProfile.tableInfo,
      acceptingPlayers: true,
    });
    const current = profile();
    view.rerender(
      <ProfileOwnerActions
        profile={{
          ...current,
          dmProfile: current.dmProfile
            ? { ...current.dmProfile, status: 'rejected', reviewRevision: 2 }
            : null,
        }}
        canAvailability
        canDm
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Resubmit DM profile' }));
    await screen.findByText('Submitted for verification.');
    expect(submitted).toMatchObject({ expectedRevision: 2 });
  });
  it('replaces availability with an empty set and isolates a failed save from profile writes', async () => {
    let slots: unknown;
    let profileCalls = 0;
    server.use(
      graphql.mutation('ProfileSetMyAvailability', ({ variables }) => {
        slots = variables.slots;
        return HttpResponse.json({
          errors: [
            { message: 'private database detail', extensions: { code: 'INVALID' } },
          ],
        });
      }),
      graphql.mutation('ProfileUpdateMyProfile', () => {
        profileCalls++;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileOwnerActions profile={profile()} canAvailability canDm />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove window 1' }));
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check the availability windows',
    );
    expect(slots).toEqual([]);
    expect(profileCalls).toBe(0);
    expect(screen.queryByText(/private database detail/)).not.toBeInTheDocument();
    expect(screen.queryByText('Availability saved.')).not.toBeInTheDocument();
  });
  it('retains an unsaved draft through an unrelated parent refresh', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <ProfileOwnerActions profile={profile()} canAvailability canDm />,
    );
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Unsaved local name',
    );
    view.rerender(
      <ProfileOwnerActions
        profile={{
          ...profile(),
          activitySummary: { messages: 99, reactions: 9, voiceMinutes: 9 },
        }}
        canAvailability
        canDm
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue(
      'Unsaved local name',
    );
  });
  it('explicitly reloads persisted fields, clears the failure and starts a fresh command key', async () => {
    const attempts: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('ProfileUpdateMyProfile', ({ variables }) => {
        attempts.push(variables);
        return attempts.length === 1
          ? HttpResponse.json({
              errors: [{ message: 'conflict', extensions: { code: 'CONFLICT' } }],
            })
          : HttpResponse.json({
              data: {
                updateMyProfile: {
                  id: wire.member.id,
                  displayName: 'Persisted current name',
                  avatarUrl: 'https://example.test/current.png',
                },
              },
            });
      }),
      graphql.query('MemberProfile', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              ...wire,
              member: {
                ...wire.member,
                displayName: 'Persisted current name',
                avatarUrl: 'https://example.test/current.png',
              },
              dmProfile: { ...wire.dmProfile, tagline: 'Persisted current tagline' },
              availability: [{ ...wire.availability[0], note: 'Persisted note' }],
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileOwnerActions profile={profile()} canAvailability canDm />,
    );
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Local draft',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Avatar URL' }),
      'https://example.test/local.png',
    );
    await user.clear(screen.getByRole('textbox', { name: 'Tagline' }));
    await user.type(screen.getByRole('textbox', { name: 'Tagline' }), 'Local tagline');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Reload profile' }));
    expect(await screen.findByDisplayValue('Persisted current name')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Avatar URL' })).toHaveValue(
      'https://example.test/current.png',
    );
    expect(screen.getByRole('textbox', { name: 'Tagline' })).toHaveValue(
      'Persisted current tagline',
    );
    expect(screen.getByRole('textbox', { name: 'Availability note 1' })).toHaveValue(
      'Persisted note',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved.');
    expect(attempts[1]?.input).toEqual({ displayName: 'Persisted current name' });
    expect(attempts[1]?.meta).not.toEqual(attempts[0]?.meta);
  });
});

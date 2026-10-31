import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { MemberProfileView } from '../adapters/memberProfileAdapter.js';
import { useProfileActions } from '../hooks/useProfileActions.js';
import { Select } from '../../../components/primitives/Select.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { statusLabel, weekdayLabel } from '../../../utils/format.js';
const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];
type DmText = 'tagline' | 'philosophy' | 'houseRules';
function dmDraft(profile: MemberProfileView) {
  return {
    tagline: profile.dmProfile?.tagline ?? '',
    philosophy: profile.dmProfile?.philosophy ?? '',
    houseRules: profile.dmProfile?.houseRules ?? '',
    acceptingPlayers: profile.dmProfile?.acceptingPlayers ?? false,
  };
}
export function ProfileOwnerActions({
  profile,
  canAvailability,
  canDm,
  focusAvailability = false,
}: {
  profile: MemberProfileView;
  canAvailability: boolean;
  canDm: boolean;
  /** Scroll the availability form into view and focus its first control on mount. */
  focusAvailability?: boolean;
}) {
  const availabilityForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = availabilityForm.current;
    if (!focusAvailability || !form) return;
    form.scrollIntoView?.({ block: 'start' });
    form
      .querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])')
      ?.focus({ preventScroll: true });
  }, [focusAvailability]);
  const dayLabelId = useId();
  const actions = useProfileActions(profile.member.handle);
  const [name, setName] = useState(profile.member.displayName);
  const [avatar, setAvatar] = useState(profile.member.avatarUrl ?? '');
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [slots, setSlots] = useState(profile.availability);
  const [dm, setDm] = useState(() => dmDraft(profile));
  const updateDm = (field: DmText, value: string) => {
    setDm((current) => ({ ...current, [field]: value }));
  };
  const changeSlot = (
    index: number,
    field: 'day' | 'startTime' | 'endTime' | 'note',
    value: string,
  ) =>
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
    );
  return (
    <section
      className="stack"
      aria-labelledby="profile-owner-heading"
      data-el="profile.ownerActions"
    >
      <h2 id="profile-owner-heading" className="type-heading">
        Your profile
      </h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          actions.execute({
            kind: 'profile',
            memberId: profile.member.id,
            input: {
              displayName: name.trim(),
              ...(avatarDirty ? { avatarUrl: avatar.trim() || null } : {}),
            },
          });
        }}
      >
        <label className="stack">
          <span className="type-label">Display name</span>
          <input
            className="field-input"
            aria-label="Display name"
            required
            maxLength={200}
            value={name}
            disabled={actions.pending}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="stack">
          <span className="type-label">Avatar URL</span>
          <input
            className="field-input"
            aria-label="Avatar URL"
            type="url"
            maxLength={2048}
            value={avatar}
            disabled={actions.pending}
            onChange={(event) => {
              setAvatar(event.target.value);
              setAvatarDirty(true);
            }}
          />
        </label>
        <p className="type-caption">
          Use an HTTPS image URL. Leave it blank to remove your avatar.
        </p>
        <Button type="submit" pending={actions.pending} disabled={!name.trim()}>
          Save profile
        </Button>
      </form>
      {canAvailability ? (
        <form
          id="availability"
          ref={availabilityForm}
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            actions.execute({
              kind: 'availability',
              memberId: profile.member.id,
              slots: slots.map((slot) => ({
                ...slot,
                startTime:
                  slot.startTime.length === 5 ? `${slot.startTime}:00` : slot.startTime,
                endTime:
                  slot.endTime.length === 5 ? `${slot.endTime}:00` : slot.endTime,
              })),
            });
          }}
        >
          <h3 className="type-heading">Your availability</h3>
          {slots.map((slot, index) => (
            <fieldset className="stack" key={index} disabled={actions.pending}>
              <legend>Window {index + 1}</legend>
              <div className="stack">
                <span id={`${dayLabelId}-${index}`}>Day {index + 1}</span>
                <Select
                  label={`Day ${index + 1}`}
                  labelId={`${dayLabelId}-${index}`}
                  value={slot.day}
                  disabled={actions.pending}
                  options={DAYS.map((day) => ({ value: day, label: weekdayLabel(day) }))}
                  onValueChange={(value) => changeSlot(index, 'day', value)}
                />
              </div>
              <label className="stack">
                Start time
                <input
                  className="field-input"
                  aria-label={`Start time ${index + 1}`}
                  type="time"
                  required
                  value={slot.startTime.slice(0, 5)}
                  onChange={(event) =>
                    changeSlot(index, 'startTime', event.target.value)
                  }
                />
              </label>
              <label className="stack">
                End time
                <input
                  className="field-input"
                  aria-label={`End time ${index + 1}`}
                  required
                  placeholder="24:00"
                  value={slot.endTime.slice(0, 5)}
                  onChange={(event) => changeSlot(index, 'endTime', event.target.value)}
                />
              </label>
              <label className="stack">
                Note
                <input
                  className="field-input"
                  aria-label={`Availability note ${index + 1}`}
                  maxLength={2000}
                  value={slot.note ?? ''}
                  onChange={(event) => changeSlot(index, 'note', event.target.value)}
                />
              </label>
              <Button
                variant="ghost"
                onClick={() =>
                  setSlots((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove window {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            disabled={actions.pending || slots.length >= 28}
            onClick={() =>
              setSlots((current) => [
                ...current,
                {
                  day: 'MONDAY',
                  startTime: '09:00:00',
                  endTime: '10:00:00',
                  note: null,
                },
              ])
            }
          >
            Add availability window
          </Button>
          <p className="type-caption">
            Use 24-hour times. End time may be 24:00. Saving with no windows clears your
            availability.
          </p>
          <Button type="submit" pending={actions.pending}>
            Save availability
          </Button>
        </form>
      ) : null}
      {canDm ? (
        <section className="stack" aria-labelledby="dm-owner-heading">
          <h3 id="dm-owner-heading" className="type-heading">
            Your DM profile
          </h3>
          <p className="type-caption">
            Review status:{' '}
            {profile.dmProfile?.status
              ? statusLabel(profile.dmProfile.status)
              : 'Not submitted'}
          </p>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              actions.execute({
                kind: 'dm',
                memberId: profile.member.id,
                input: {
                  acceptingPlayers: dm.acceptingPlayers,
                  tagline: dm.tagline.trim() || null,
                  philosophy: dm.philosophy.trim() || null,
                  houseRules: dm.houseRules.trim() || null,
                  tableInfo: profile.dmProfile?.tableInfo ?? null,
                },
              });
            }}
          >
            {(['tagline', 'philosophy', 'houseRules'] satisfies DmText[]).map(
              (field) => (
                <label className="stack" key={field}>
                  <span className="type-label">
                    {field === 'houseRules'
                      ? 'House rules'
                      : field === 'tagline'
                        ? 'Tagline'
                        : 'Philosophy'}
                  </span>
                  <textarea
                    className="field-input"
                    aria-label={
                      field === 'houseRules'
                        ? 'House rules'
                        : field === 'tagline'
                          ? 'Tagline'
                          : 'Philosophy'
                    }
                    maxLength={field === 'tagline' ? 200 : 4000}
                    disabled={actions.pending}
                    value={dm[field]}
                    onChange={(event) => updateDm(field, event.target.value)}
                  />
                </label>
              ),
            )}
            <Checkbox
              label="Accepting players"
              checked={dm.acceptingPlayers}
              disabled={actions.pending}
              onCheckedChange={(acceptingPlayers) =>
                setDm((current) => ({ ...current, acceptingPlayers }))
              }
            />
            <Button type="submit" pending={actions.pending}>
              Save DM profile
            </Button>
          </form>
          <p className="type-caption">
            Saving creates a new draft revision. Submit the saved revision when it is
            ready for review.
          </p>
          <Button
            variant="secondary"
            disabled={
              actions.pending ||
              !profile.dmProfile ||
              !['draft', 'rejected'].includes(profile.dmProfile.status)
            }
            onClick={() => {
              if (profile.dmProfile)
                actions.execute({
                  kind: 'submit',
                  memberId: profile.member.id,
                  expectedRevision: profile.dmProfile.reviewRevision,
                });
            }}
          >
            {profile.dmProfile?.status === 'rejected'
              ? 'Resubmit DM profile'
              : 'Submit DM profile for verification'}
          </Button>
        </section>
      ) : null}
      {actions.message ? <p role="status">{actions.message}</p> : null}
      {actions.error ? (
        <>
          <StatePanel status="error" error={actions.error} />
          <Button
            variant="ghost"
            disabled={actions.pending}
            onClick={async () => {
              const current = await actions.reload();
              if (!current) return;
              setName(current.member.displayName);
              setAvatar(current.member.avatarUrl ?? '');
              setAvatarDirty(false);
              setSlots(current.availability);
              setDm(dmDraft(current));
            }}
          >
            Reload profile
          </Button>
        </>
      ) : null}
    </section>
  );
}

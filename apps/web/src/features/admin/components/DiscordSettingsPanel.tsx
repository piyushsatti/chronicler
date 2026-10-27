import { useEffect, useRef } from 'react';
import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useDiscordSettingsPanel } from '../hooks/useDiscordSettingsPanel.js';
import styles from './DiscordSettingsPanel.module.css';

/** Admin settings for quest announcements in Discord. The bot token and server id are deploy secrets. */
export function DiscordSettingsPanel({
  view,
}: {
  view: ReturnType<typeof useDiscordSettingsPanel>;
}): React.JSX.Element {
  const {
    settingsQ,
    announceChannelId,
    setAnnounceChannelId,
    roleId,
    setRoleId,
    voiceChannels,
    addVoiceChannel,
    updateVoiceChannel,
    removeVoiceChannel,
    errors,
    summaryFocus,
    saveMessage,
    submit,
    save,
  } = view;
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  if (settingsQ.isError) {
    return <AdminReadFailure error={settingsQ.error} retry={settingsQ.retry} />;
  }
  if (settingsQ.isLoading) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card data-el="admin.discordSettingsPanel" className={`stack ${styles.panel}`} data-gap="5">
      <p className="type-caption">
        These IDs come from Discord. Turn on Developer Mode in Discord settings, then
        right-click a channel or role and choose Copy ID. Saving only changes where
        the next quest announcements go. Nothing is posted to Discord when you save.
      </p>
      {errors.summary.length > 0 ? (
        <div
          ref={summaryRef}
          className={styles.summary}
          data-el="admin.discordSettingsErrors"
          role="group"
          aria-label="Fields that need attention"
          tabIndex={-1}
        >
          <strong>
            {errors.summary.length === 1
              ? '1 thing needs attention'
              : `${errors.summary.length} things need attention`}
          </strong>
          <ul>
            {errors.summary.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset className={`stack ${styles.group}`} data-gap="3">
        <legend className="type-label">Announcements</legend>
        <div className="stack" data-gap="1">
          <label className="type-label" htmlFor="discord-announce-channel">
            Announce channel ID
          </label>
          <input
            id="discord-announce-channel"
            aria-describedby="discord-announce-channel-help"
            className="field-input"
            inputMode="numeric"
            autoComplete="off"
            disabled={save.isPending}
            aria-invalid={errors.announceChannelId ? true : undefined}
            placeholder="17 to 20 digits"
            value={announceChannelId}
            onChange={(e) => setAnnounceChannelId(e.target.value)}
          />
          <span className="type-caption" id="discord-announce-channel-help">
            The text channel where quest announcements are posted. If you leave this
            empty, the server&rsquo;s deploy setting is used when there is one.
          </span>
          {errors.announceChannelId ? (
            <span className="type-caption" role="alert">
              {errors.announceChannelId}
            </span>
          ) : null}
        </div>
        <div className="stack" data-gap="1">
          <label className="type-label" htmlFor="discord-quest-role">
            Quest role ID
          </label>
          <input
            id="discord-quest-role"
            aria-describedby="discord-quest-role-help"
            className="field-input"
            inputMode="numeric"
            autoComplete="off"
            disabled={save.isPending}
            aria-invalid={errors.roleId ? true : undefined}
            placeholder="17 to 20 digits"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          />
          <span className="type-caption" id="discord-quest-role-help">
            This role is pinged at the top of each announcement. Leave it empty to ping
            nobody.
          </span>
          {errors.roleId ? (
            <span className="type-caption" role="alert">
              {errors.roleId}
            </span>
          ) : null}
        </div>
      </fieldset>
      <fieldset className={`stack ${styles.group}`} data-gap="3">
        <legend className="type-label">Voice channels</legend>
        <p className="type-caption">
          DMs pick one of these on the quest form. A quest with a voice channel also
          gets a Discord event for its session.
        </p>
        {voiceChannels.length === 0 ? (
          <p className="type-body" data-el="admin.discordVoiceEmpty">
            No voice channels yet. Add one so DMs can choose it.
          </p>
        ) : (
          <ul className={styles.rows} aria-label="Voice channels">
            {voiceChannels.map((row, index) => {
              const issue = errors.voiceChannels[row.key];
              return (
                <li key={row.key} className={styles.row}>
                  <div className="stack" data-gap="1">
                    <label className="type-label" htmlFor={`discord-voice-name-${row.key}`}>
                      Name {index + 1}
                    </label>
                    <input
                      id={`discord-voice-name-${row.key}`}
                      className="field-input"
                      disabled={save.isPending}
                      aria-invalid={issue?.name ? true : undefined}
                      placeholder="For example Table 1"
                      value={row.name}
                      onChange={(e) =>
                        updateVoiceChannel(row.key, { name: e.target.value })
                      }
                    />
                    {issue?.name ? (
                      <span className="type-caption" role="alert">
                        {issue.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="stack" data-gap="1">
                    <label className="type-label" htmlFor={`discord-voice-id-${row.key}`}>
                      Channel ID {index + 1}
                    </label>
                    <input
                      id={`discord-voice-id-${row.key}`}
                      className="field-input"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={save.isPending}
                      aria-invalid={issue?.channelId ? true : undefined}
                      placeholder="17 to 20 digits"
                      value={row.channelId}
                      onChange={(e) =>
                        updateVoiceChannel(row.key, { channelId: e.target.value })
                      }
                    />
                    {issue?.channelId ? (
                      <span className="type-caption" role="alert">
                        {issue.channelId}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    aria-label={`Remove voice channel ${index + 1}${row.name.trim() ? `, ${row.name.trim()}` : ''}`}
                    onClick={() => removeVoiceChannel(row.key)}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={save.isPending}
            onClick={addVoiceChannel}
          >
            Add voice channel
          </Button>
        </div>
      </fieldset>
      <div className="row" data-wrap="1" data-gap="3" data-align="center">
        <Button type="button" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save Discord settings'}
        </Button>
        {saveMessage ? (
          <p className="type-caption" role="status">
            {saveMessage}
          </p>
        ) : null}
      </div>
      {save.isError ? (
        <StatePanel variant="inline" status="error" error={save.error} />
      ) : null}
    </Card>
  );
}

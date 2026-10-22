import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useHomeBannerPanel } from '../hooks/useHomeBannerPanel.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import styles from './HomeBannerPanel.module.css';

/** The kinds the home banner can render (`classifyBannerMedia`). */
const MEDIA_KINDS: Record<string, string> = {
  image: 'Image',
  video: 'Video (file, YouTube or Vimeo)',
  music: 'Music (audio file or Spotify)',
};

export function HomeBannerPanel({
  view,
}: {
  view: ReturnType<typeof useHomeBannerPanel>;
}): React.JSX.Element {
  const {
    bannerQ,
    enabled,
    setEnabled,
    title,
    setTitle,
    body,
    setBody,
    ctaLabel,
    setCtaLabel,
    ctaHref,
    setCtaHref,
    saveMessage,
    save,
  } = view;

  if (bannerQ.isError) {
    return <AdminReadFailure error={bannerQ.error} retry={bannerQ.retry} />;
  }
  if (bannerQ.isLoading) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card
      data-el="admin.homeBannerPanel"
      className={`stack ${styles.panel}`}
      data-gap="5"
    >
      <div className="stack" data-gap="1">
        <h3 className="type-heading">Home banner</h3>
        <p className="type-caption">
          Shown at the top of the home page while enabled. Leave media empty for a
          text-only banner.
        </p>
      </div>
      <Checkbox
        label="Show the banner on the home page"
        disabled={save.isPending}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      <fieldset className={`stack ${styles.group}`} data-gap="3">
        <legend className="type-label">Message</legend>
        <label className="stack" data-gap="1">
          <span className="type-label">Title</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="stack" data-gap="1">
          <span className="type-label">Body</span>
          <textarea
            disabled={save.isPending}
            className="field-input"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className={styles.pair}>
          <label className="stack" data-gap="1">
            <span className="type-label">Button label</span>
            <input
              disabled={save.isPending}
              className="field-input"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
            />
          </label>
          <label className="stack" data-gap="1">
            <span className="type-label">Button link</span>
            <input
              disabled={save.isPending}
              className="field-input"
              placeholder="/quests or https://…"
              value={ctaHref}
              onChange={(e) => setCtaHref(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className={`stack ${styles.group}`} data-gap="3">
        <legend className="type-label">Media</legend>
        <div className={styles.pair}>
          <label className="stack" data-gap="1">
            <span className="type-label">Media kind</span>
            <select
              className="field-input"
              disabled={save.isPending}
              value={view.mediaKind}
              onChange={(e) => view.setMediaKind(e.target.value)}
            >
              <option value="">No media</option>
              {[
                ...Object.entries(MEDIA_KINDS),
                ...(view.mediaKind && !(view.mediaKind in MEDIA_KINDS)
                  ? [[view.mediaKind, view.mediaKind] as const]
                  : []),
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" data-gap="1">
            <span className="type-label">Media label</span>
            <input
              className="field-input"
              disabled={save.isPending}
              value={view.mediaLabel}
              onChange={(e) => view.setMediaLabel(e.target.value)}
            />
          </label>
        </div>
        <label className="stack" data-gap="1">
          <span className="type-label">Media URL (HTTPS)</span>
          <input
            className="field-input"
            disabled={save.isPending}
            placeholder="https://…"
            value={view.mediaUrl}
            onChange={(e) => view.setMediaUrl(e.target.value)}
          />
        </label>
      </fieldset>
      <div className="row" data-wrap="1" data-gap="3" data-align="center">
        <Button
          type="button"
          disabled={save.isPending || (enabled && !title.trim())}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save banner'}
        </Button>
        {enabled && !title.trim() ? (
          <p className="type-caption">An enabled banner needs a title.</p>
        ) : saveMessage ? (
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

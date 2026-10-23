import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Select } from '../../../components/primitives/Select.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useHomeBannerPanel } from '../hooks/useHomeBannerPanel.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
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

  const preview = (
    <Card className={`stack ${styles.panel}`} data-gap="3" aria-label="Banner preview">
      <span className="type-label">Preview</span>
      {enabled ? (
        <div className={styles.preview} data-el="admin.homeBannerPreview">
          <p className={`type-title ${styles.previewTitle}`}>
            {title.trim() || 'Your banner title'}
          </p>
          {body.trim() ? <p className="type-body">{body}</p> : null}
          {ctaLabel.trim() ? (
            <span className={`btn btn--primary btn--sm ${styles.previewButton}`}>
              {ctaLabel}
            </span>
          ) : null}
          {view.mediaKind ? (
            <p className="type-caption">
              {MEDIA_KINDS[view.mediaKind] ?? view.mediaKind}
              {view.mediaLabel.trim() ? `: ${view.mediaLabel}` : ''}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="type-caption">
          The banner is off. Turn it on to show this on the home page.
        </p>
      )}
      <p className="type-caption">
        A simplified preview. The banner sits at the top of the home page while it is
        on.
      </p>
    </Card>
  );

  return (
    <DetailLayout rail={preview} railLabel="Banner preview">
      <Card
        data-el="admin.homeBannerPanel"
        className={`stack ${styles.panel}`}
        data-gap="5"
      >
        <p className="type-caption">Leave media empty for a text-only banner.</p>
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
              <span className="type-label">Link address</span>
              <input
                disabled={save.isPending}
                className="field-input"
                placeholder="For example /quests"
                value={ctaHref}
                onChange={(e) => setCtaHref(e.target.value)}
              />
            </label>
          </div>
          <p className="type-caption">
            Leave the button label and link empty to show no button.
          </p>
        </fieldset>
        <fieldset className={`stack ${styles.group}`} data-gap="3">
          <legend className="type-label">Media</legend>
          <div className={styles.pair}>
            <div className="stack" data-gap="1">
              <span className="type-label" id="banner-media-kind-label">
                Media kind
              </span>
              <Select
                label="Media kind"
                labelId="banner-media-kind-label"
                disabled={save.isPending}
                value={view.mediaKind}
                onValueChange={view.setMediaKind}
                options={[
                  { value: '', label: 'No media' },
                  ...Object.entries(MEDIA_KINDS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                  ...(view.mediaKind && !(view.mediaKind in MEDIA_KINDS)
                    ? [{ value: view.mediaKind, label: view.mediaKind }]
                    : []),
                ]}
              />
            </div>
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
            <span className="type-label">Media link</span>
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
    </DetailLayout>
  );
}

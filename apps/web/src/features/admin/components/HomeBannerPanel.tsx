import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useHomeBannerPanel } from '../hooks/useHomeBannerPanel.js';

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
    return <StatePanel status="error" error={bannerQ.error} />;
  }
  if (bannerQ.isLoading) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card data-el="admin.homeBannerPanel" className="stack">
      <h3 className="type-heading">Home banner</h3>
      <label className="row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span className="type-body">Enabled</span>
      </label>
      <label className="stack">
        <span className="type-label">Title</span>
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="stack">
        <span className="type-label">Body</span>
        <textarea
          className="field"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="stack">
        <span className="type-label">CTA label</span>
        <input
          className="field"
          value={ctaLabel}
          onChange={(e) => setCtaLabel(e.target.value)}
        />
      </label>
      <label className="stack">
        <span className="type-label">CTA href</span>
        <input
          className="field"
          value={ctaHref}
          onChange={(e) => setCtaHref(e.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={save.isPending || (enabled && !title.trim())}
        onClick={() => save.mutate()}
      >
        Save banner
      </Button>
      {saveMessage ? <p className="type-caption">{saveMessage}</p> : null}
      {save.isError ? <StatePanel status="error" error={save.error} /> : null}
    </Card>
  );
}

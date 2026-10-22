type BannerMedia =
  | { kind: 'image' | 'video' | 'audio'; url: string; label: string }
  | {
      kind: 'youtube' | 'vimeo' | 'spotify';
      url: string;
      embedUrl: string;
      label: string;
    };

function httpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443')
      ? url
      : null;
  } catch {
    return null;
  }
}

export function isSafeHttpsUrl(raw: string): boolean {
  return httpsUrl(raw) !== null;
}

export function classifyBannerMedia(
  kind: string | null,
  rawUrl: string | null,
  rawLabel: string | null,
): BannerMedia | null {
  if (!kind || !rawUrl) return null;
  const url = httpsUrl(rawUrl);
  if (!url) return null;
  const label = rawLabel?.trim() || 'Banner media';
  const source = { url: url.toString(), label };
  if (kind === 'image') return { kind, ...source };
  if (kind === 'video') {
    if (
      ['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(
        url.hostname,
      )
    ) {
      const segments = url.pathname.split('/').filter(Boolean);
      const id =
        url.hostname === 'youtu.be' && segments.length === 1
          ? segments[0]
          : url.pathname === '/watch'
            ? url.searchParams.get('v')
            : segments.length === 2 &&
                (segments[0] === 'embed' || segments[0] === 'shorts')
              ? segments[1]
              : null;
      return id && /^[A-Za-z0-9_-]{6,20}$/.test(id)
        ? {
            kind: 'youtube',
            ...source,
            embedUrl: `https://www.youtube.com/embed/${id}`,
          }
        : null;
    }
    if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
      const path =
        url.hostname === 'player.vimeo.com' ? /^\/video\/(\d+)\/?$/ : /^\/(\d+)\/?$/;
      const match = url.pathname.match(path);
      return match
        ? {
            kind: 'vimeo',
            ...source,
            embedUrl: `https://player.vimeo.com/video/${match[1]}`,
          }
        : null;
    }
    if (/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(url.toString())) {
      return { kind: 'video', ...source };
    }
  }
  if (kind === 'music') {
    if (url.hostname === 'open.spotify.com') {
      const match = url.pathname.match(
        /^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/,
      );
      return match
        ? {
            kind: 'spotify',
            ...source,
            embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
          }
        : null;
    }
    if (/\.(?:mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/i.test(url.toString())) {
      return { kind: 'audio', ...source };
    }
  }
  return null;
}

export function BannerMediaEmbed({ media }: { media: BannerMedia }): React.JSX.Element {
  return (
    <figure className="cr-media-figure" data-media-kind={media.kind}>
      {media.kind === 'image' ? (
        <img
          className="cr-media-image"
          src={media.url}
          alt={media.label}
          loading="lazy"
        />
      ) : media.kind === 'video' ? (
        <video
          className="cr-media-video"
          controls
          preload="metadata"
          aria-label={media.label}
        >
          <source src={media.url} />
        </video>
      ) : media.kind === 'audio' ? (
        <audio
          className="cr-media-audio"
          controls
          preload="metadata"
          aria-label={media.label}
        >
          <source src={media.url} />
        </audio>
      ) : 'embedUrl' in media ? (
        <iframe
          className="cr-media-frame"
          src={media.embedUrl}
          title={media.label}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : null}
      <figcaption className="cr-media-caption">
        <span>{media.label}</span>
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cr-ext"
        >
          Open source
        </a>
      </figcaption>
    </figure>
  );
}

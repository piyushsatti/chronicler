import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  BannerMediaEmbed,
  classifyBannerMedia,
  isSafeHttpsUrl,
} from '../../../src/components/foundation/contentMedia.js';

describe('banner media', () => {
  it.each([
    ['image', 'https://cdn.example.test/banner.webp', 'image', undefined],
    ['video', 'https://cdn.example.test/trailer.mp4', 'video', undefined],
    ['music', 'https://cdn.example.test/theme.mp3?download=1', 'audio', undefined],
    [
      'video',
      'https://youtu.be/abc1234',
      'youtube',
      'https://www.youtube.com/embed/abc1234',
    ],
    [
      'video',
      'https://vimeo.com/1234567',
      'vimeo',
      'https://player.vimeo.com/video/1234567',
    ],
    [
      'music',
      'https://open.spotify.com/track/track123',
      'spotify',
      'https://open.spotify.com/embed/track/track123',
    ],
  ])(
    'renders %s media from %s with its source link',
    (kind, url, expectedKind, embedUrl) => {
      const media = classifyBannerMedia(kind, url, 'Festival');
      expect(media?.kind).toBe(expectedKind);
      if (!media) throw new Error('Expected supported banner media');
      const { container } = render(<BannerMediaEmbed media={media} />);
      expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
        'href',
        url,
      );
      if (embedUrl)
        expect(screen.getByTitle('Festival')).toHaveAttribute('src', embedUrl);
      else if (expectedKind === 'image')
        expect(screen.getByRole('img', { name: 'Festival' })).toHaveAttribute(
          'src',
          url,
        );
      else expect(container.querySelector(expectedKind)).toHaveAttribute('controls');
    },
  );

  it.each([
    'javascript:alert(1)',
    'http://cdn.example.test/banner.webp',
    'https://user:pass@cdn.example.test/trailer.mp4',
    'https://cdn.example.test:8443/trailer.mp4',
  ])('rejects unsafe sources %s', (url) => {
    expect(isSafeHttpsUrl(url)).toBe(false);
    expect(classifyBannerMedia('image', url, 'Banner')).toBeNull();
  });

  it.each([
    ['video', 'https://youtu.be/abc1234/extra'],
    ['video', 'https://www.youtube.com/embed/abc1234/extra'],
    ['video', 'https://youtube.com.evil.test/watch?v=abc1234'],
    ['video', 'https://open.spotify.com/track/track123'],
    ['music', 'https://www.youtube.com/watch?v=abc1234'],
    ['video', 'https://cdn.example.test/theme.mp3'],
    ['video', 'https://cdn.example.test/page.html'],
  ])('does not embed unsupported or cross-type %s URL %s', (kind, url) => {
    expect(classifyBannerMedia(kind, url, 'Banner')).toBeNull();
  });
});

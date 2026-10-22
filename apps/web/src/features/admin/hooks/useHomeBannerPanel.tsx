import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadHomeBanner, upsertHomeBanner } from '../adapters/adminAdapter.js';

const BANNER_KEY = ['homeBanner'] as const;

export function useHomeBannerPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const bannerQ = useQuery({
    enabled: authority.allowed,
    queryKey: [...BANNER_KEY, authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadHomeBanner, signal),
  });
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaHref, setCtaHref] = useState('');
  const [mediaKind, setMediaKind] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaLabel, setMediaLabel] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!bannerQ.data) return;
    setEnabled(bannerQ.data.enabled);
    setTitle(bannerQ.data.title ?? '');
    setBody(bannerQ.data.body ?? '');
    setCtaLabel(bannerQ.data.ctaLabel ?? '');
    setCtaHref(bannerQ.data.ctaHref ?? '');
    setMediaKind(bannerQ.data.mediaKind ?? '');
    setMediaUrl(bannerQ.data.mediaUrl ?? '');
    setMediaLabel(bannerQ.data.mediaLabel ?? '');
  }, [bannerQ.data]);

  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useHomeBannerPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command) =>
      upsertHomeBanner(
        {
          enabled,
          title: title.trim() || null,
          body: body.trim() || null,
          ctaLabel: ctaLabel.trim() || null,
          ctaHref: ctaHref.trim() || null,
          mediaKind: mediaKind || null,
          mediaUrl: mediaUrl.trim() || null,
          mediaLabel: mediaLabel.trim() || null,
        },
        command,
      ),
    ),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      setSaveMessage('Home banner saved.');
      await queryClient.invalidateQueries({ queryKey: BANNER_KEY });
    },
  });
  useAuthorityFailures(bannerQ.error, save.error);
  return {
    bannerQ: panelState(
      {
        ...bannerQ,
        retry: () => {
          void bannerQ.refetch();
        },
      },
      'admin:HomeBannerPanel',
    ),
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
    mediaKind,
    setMediaKind,
    mediaUrl,
    setMediaUrl,
    mediaLabel,
    setMediaLabel,
    saveMessage,
    save: panelState(save, 'admin:HomeBannerPanel'),
  };
}

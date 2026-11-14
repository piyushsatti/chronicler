import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadHomeBanner,
  upsertHomeBanner,
  type HomeBannerView,
} from '../adapters/adminAdapter.js';

const BANNER_KEY = ['homeBanner'] as const;

export function useHomeBannerPanel() {
  const authority = useAdminAuthority();
  const bannerQ = useQuery({
    enabled: authority.allowed,
    queryKey: [...BANNER_KEY, authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadHomeBanner, signal),
  });
  useAuthorityFailures(bannerQ.error);
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
  };
}

export function useHomeBannerForm(
  initial: HomeBannerView,
  setSaveMessage: (message: string | null) => void,
) {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [title, setTitle] = useState(initial.title ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel ?? '');
  const [ctaHref, setCtaHref] = useState(initial.ctaHref ?? '');
  const [mediaKind, setMediaKind] = useState(initial.mediaKind ?? '');
  const [mediaUrl, setMediaUrl] = useState(initial.mediaUrl ?? '');
  const [mediaLabel, setMediaLabel] = useState(initial.mediaLabel ?? '');

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
      await queryClient.invalidateQueries({ queryKey: BANNER_KEY });
      setSaveMessage('Home banner saved.');
    },
  });
  useAuthorityFailures(save.error);
  return {
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
    save: panelState(save, 'admin:HomeBannerPanel'),
  };
}

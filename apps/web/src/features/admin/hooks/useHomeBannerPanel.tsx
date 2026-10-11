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
    queryKey: BANNER_KEY,
    queryFn: loadHomeBanner,
  });
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaHref, setCtaHref] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!bannerQ.data) return;
    setEnabled(bannerQ.data.enabled);
    setTitle(bannerQ.data.title ?? '');
    setBody(bannerQ.data.body ?? '');
    setCtaLabel(bannerQ.data.ctaLabel ?? '');
    setCtaHref(bannerQ.data.ctaHref ?? '');
  }, [bannerQ.data]);

  const save = useMutation({
    mutationFn: authority.guardMutation(() =>
      upsertHomeBanner({
        enabled,
        title: title.trim() || null,
        body: body.trim() || null,
        ctaLabel: ctaLabel.trim() || null,
        ctaHref: ctaHref.trim() || null,
        mediaKind: bannerQ.data?.mediaKind ?? null,
        mediaUrl: bannerQ.data?.mediaUrl ?? null,
        mediaLabel: bannerQ.data?.mediaLabel ?? null,
      }),
    ),
    onSuccess: async () => {
      setSaveMessage('Home banner saved.');
      await queryClient.invalidateQueries({ queryKey: BANNER_KEY });
    },
  });
  useAuthorityFailures(bannerQ.error, save.error);
  return {
    bannerQ: panelState(bannerQ, 'admin:HomeBannerPanel'),
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
    save: panelState(save, 'admin:HomeBannerPanel'),
  };
}

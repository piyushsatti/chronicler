import { z } from 'zod';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const homeBannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaHref: z.string().nullable().optional(),
  mediaKind: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  mediaLabel: z.string().nullable().optional(),
});

export type HomeBannerView = {
  enabled: boolean;
  title: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaLabel: string | null;
};

export function parseHomeBanner(wire: unknown): AdapterResult<HomeBannerView> {
  const parsed = homeBannerSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      enabled: parsed.data.enabled,
      title: parsed.data.title ?? null,
      body: parsed.data.body ?? null,
      ctaLabel: parsed.data.ctaLabel ?? null,
      ctaHref: parsed.data.ctaHref ?? null,
      mediaKind: parsed.data.mediaKind ?? null,
      mediaUrl: parsed.data.mediaUrl ?? null,
      mediaLabel: parsed.data.mediaLabel ?? null,
    },
  };
}

/** Public home banner read — field-routing GET /v1/site-settings/home-banner. */
export async function loadHomeBanner(): Promise<HomeBannerView> {
  try {
    const wire = await restRequest<unknown>(rest.homeBanner);
    const result = parseHomeBanner(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'home:banner');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:banner');
  }
}

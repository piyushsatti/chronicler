import { createContext, useContext } from 'react';

/** Who is looking, as far as copy is concerned. Never grants or checks authority. */
export type ViewerAudience = 'guest' | 'member';

export type ViewerAudienceValue = {
  audience: ViewerAudience;
  /** Remembers the current page so sign-in returns here. */
  rememberReturn: () => void;
};

/** Provided by the auth layer; foundation states read it to pick audience copy. */
export const ViewerAudienceContext = createContext<ViewerAudienceValue>({
  audience: 'member',
  rememberReturn: () => undefined,
});

export function useViewerAudience(): ViewerAudienceValue {
  return useContext(ViewerAudienceContext);
}

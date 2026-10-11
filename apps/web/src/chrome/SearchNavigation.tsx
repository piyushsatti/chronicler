import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import {
  dialogClosed,
  dialogOpened,
  selectSearchDialogOpen,
} from '../store/searchSlice.js';

/**
 * Chrome search hooks: Redux dialog open state + mod+k / route-close.
 * SiteChrome consumes the already-wired SearchCommandRoot for the palette UI;
 * this bridge keeps the search slice in parity with legacy SearchNavigation.
 */
export function SearchNavigation(): null {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const open = useAppSelector(selectSearchDialogOpen);

  useEffect(() => {
    dispatch(dialogClosed());
  }, [dispatch, location.key]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatch(dialogOpened());
      }
      if (event.key === 'Escape' && open) {
        dispatch(dialogClosed());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, open]);

  return null;
}

export { selectSearchDialogOpen, dialogOpened, dialogClosed };

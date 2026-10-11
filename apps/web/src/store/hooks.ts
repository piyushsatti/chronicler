import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store.js';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore = useStore.withTypes<AppStore>();

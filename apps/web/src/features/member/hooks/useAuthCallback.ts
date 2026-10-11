import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { consumeIntendedPath } from '../../../auth/intendedPath.js';
import { consumeOAuthState } from '../../../auth/oauthState.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { exchangeAuthCallback } from '../adapters/memberAdapter.js';

export type AuthCallbackView = {
  error: AppError | null;
};

export function useAuthCallback(): AuthCallbackView {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { storeToken } = useAuth();
  const [error, setError] = useState<AppError | null>(null);
  const exchangeRef = useRef<{
    key: string;
    promise: Promise<string> | null;
    error: AppError | null;
    finished: boolean;
  } | null>(null);
  const key = params.toString();
  const currentKey = useRef(key);
  currentKey.current = key;
  const code = params.get('code');
  const state = params.get('state');
  const providerError = params.has('error');
  const ambiguous = ['code', 'state', 'error'].some(
    (name) => params.getAll(name).length > 1,
  );
  const exchange = useMutation({
    mutationFn: exchangeAuthCallback,
    retry: false,
  });
  const { mutateAsync } = exchange;

  useEffect(() => {
    let cancelled = false;
    if (exchangeRef.current?.key !== key) {
      // Keep the validated attempt across StrictMode's effect cleanup/remount.
      // The nonce is consumed exactly once, before any exchange is initiated.
      const verified = consumeOAuthState(state);
      let validationError: AppError | null = null;
      if (!verified || ambiguous) {
        validationError = safeAppError(
          'Sign-in could not be verified. Start again from Sign in.',
          'auth:callback',
        );
      } else if (providerError) {
        validationError = safeAppError(
          'Discord sign-in was cancelled or denied. Try signing in again.',
          'auth:callback',
        );
      } else if (!code) {
        validationError = toAppError({ failure: 'InvalidWire' }, 'auth:callback');
      }
      exchangeRef.current = {
        key,
        promise: validationError ? null : mutateAsync({ code: code!, state: state! }),
        error: validationError,
        finished: false,
      };
      setError(null);
    }
    const attempt = exchangeRef.current;
    if (attempt.error) {
      setError(attempt.error);
      return;
    }
    if (!attempt.promise || attempt.finished) return;
    void attempt.promise.then(
      (token) => {
        if (cancelled || currentKey.current !== key || attempt.finished) return;
        attempt.finished = true;
        try {
          storeToken(token);
        } catch (cause) {
          attempt.error = toAppError(cause, 'auth:callback');
          setError(attempt.error);
          return;
        }
        let intendedPath: string | null = null;
        try {
          intendedPath = consumeIntendedPath();
        } catch {
          // An unavailable redirect stash must not undo a successful sign-in.
        }
        navigate(intendedPath ?? '/', { replace: true });
      },
      (cause: unknown) => {
        if (cancelled || currentKey.current !== key || attempt.finished) return;
        attempt.finished = true;
        attempt.error = toAppError(cause, 'auth:callback');
        setError(attempt.error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ambiguous, code, key, mutateAsync, navigate, providerError, state, storeToken]);

  return { error };
}

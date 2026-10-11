import { useQueryClient } from '@tanstack/react-query';
import {
  Component,
  Fragment,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChunkReloadFailedError,
  forceChunkReload,
} from './lazyWithReload.js';

type ErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
  locationKey?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  resetKey: number;
  error: Error | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, resetKey: 0, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.locationKey !== this.props.locationKey) {
      this.props.onReset?.();
      this.setState((s) => ({
        hasError: false,
        resetKey: s.resetKey + 1,
        error: null,
      }));
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error.message, info.componentStack);
    }
  }

  handleRetry = (): void => {
    if (this.state.error instanceof ChunkReloadFailedError) {
      forceChunkReload();
      return;
    }
    this.props.onReset?.();
    this.setState((s) => ({
      hasError: false,
      resetKey: s.resetKey + 1,
      error: null,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const err = this.state.error;
      const message =
        err instanceof ChunkReloadFailedError
          ? err.message
          : 'Something went wrong loading this page. Please try again.';
      return (
        <div
          className="app-error-boundary stack"
          data-align="center"
          data-justify="center"
        >
          <h1 className="type-title">Something went wrong</h1>
          <p className="type-body">{message}</p>
          <button type="button" className="btn" onClick={this.handleRetry}>
            Try again
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

export function RootErrorBoundary({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const location = useLocation();
  return (
    <ErrorBoundary
      locationKey={`${location.pathname}${location.search}`}
      onReset={() => {
        void queryClient.resetQueries();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

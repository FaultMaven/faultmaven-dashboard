import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-fm-canvas p-4">
            <div className="bg-fm-surface border border-fm-critical-border rounded-fm-card shadow-fm-card p-6 max-w-md w-full">
              <h2 className="text-xl font-bold text-fm-critical mb-2">Something went wrong</h2>
              <p className="text-fm-text-secondary mb-4">
                The application encountered an unexpected error.
              </p>
              {this.state.error && (
                <div className="bg-fm-elevated p-3 rounded-fm-btn text-fm-xs font-mono text-fm-critical mb-4 overflow-auto">
                  {this.state.error.message}
                </div>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-fm-accent text-white rounded-fm-btn hover:brightness-110 transition-colors"
              >
                Reload Application
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

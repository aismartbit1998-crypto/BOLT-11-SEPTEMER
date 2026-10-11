import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React render crash caught by ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleFullReset = () => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    window.location.href = window.location.origin;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-base-900 text-white">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-neon-red/15 border border-neon-red/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-neon-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              The admin panel encountered an unexpected error. Try reloading the page, or clear your session data and start fresh.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm font-semibold hover:bg-white/[0.1] transition-all"
              >
                Try Again
              </button>
              <button
                onClick={this.handleFullReset}
                className="px-4 py-2 rounded-xl bg-neon-red/15 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 text-sm font-semibold transition-all"
              >
                Clear Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

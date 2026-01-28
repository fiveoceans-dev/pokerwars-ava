"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    // Update state so the next render will show the fallback UI
    const err = error instanceof Error ? error : new Error(String(error));
    return { hasError: true, error: err, errorInfo: null };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    // Normalize the error
    const err = error instanceof Error ? error : new Error(String(error));

    // Log error details
    console.error("🚫 React Error Boundary caught an error:", err, errorInfo);

    // Update state with error info
    this.setState({
      error: err,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(err, errorInfo);
    }
  }

  private handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-start justify-center min-h-[200px] px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.4em] text-red-300">
            System Error
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="text-red-200 text-sm mb-4 max-w-md">
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <div className="flex gap-4 text-sm">
            <button onClick={this.handleRetry} className="tbtn">
              Try Again
            </button>
            <button onClick={() => window.location.reload()} className="tbtn">
              Refresh Page
            </button>
          </div>
          {process.env.NODE_ENV === "development" && this.state.errorInfo && (
            <details className="mt-4 text-xs text-white/50 max-w-full overflow-auto">
              <summary className="cursor-pointer hover:text-white/70">
                Show Error Details (Development)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap">
                {this.state.error?.stack}
                {"\n\nComponent Stack:"}
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

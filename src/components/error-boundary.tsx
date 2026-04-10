'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'unnamed'}]`, error, errorInfo);
    this.setState({ error, errorInfo });

    // In production, you might want to send this to an error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error);
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-4">
          <Alert
            variant="destructive"
            className={cn(
              'max-w-md w-full',
              'border-red-200 bg-red-50 dark:bg-red-950/20'
            )}
          >
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
            <AlertTitle className="text-red-800 dark:text-red-400">
              {this.props.name ? `${this.props.name} Error` : 'Something went wrong'}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p className="text-sm text-red-700 dark:text-red-300">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400 hover:underline">
                    Error details (development)
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950 p-3 text-xs text-red-200">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleReset}
                  className="flex items-center gap-1"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Try again
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={this.handleGoHome}
                  className="flex items-center gap-1"
                >
                  <Home className="h-3.5 w-3.5" />
                  Go home
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

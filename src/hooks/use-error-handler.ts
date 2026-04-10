'use client';

import { useCallback, useState } from 'react';

interface UseErrorHandlerReturn {
  error: Error | null;
  hasError: boolean;
  handleError: (error: Error) => void;
  clearError: () => void;
  reset: () => void;
}

/**
 * Hook for handling errors in functional components
 */
export function useErrorHandler(componentName?: string): UseErrorHandlerReturn {
  const [error, setError] = useState<Error | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback((err: Error) => {
    console.error(`[useErrorHandler:${componentName || 'unnamed'}]`, err);
    setError(err);
    setHasError(true);
  }, [componentName]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setHasError(false);
  }, []);

  return {
    error,
    hasError,
    handleError,
    clearError,
    reset,
  };
}

export default useErrorHandler;

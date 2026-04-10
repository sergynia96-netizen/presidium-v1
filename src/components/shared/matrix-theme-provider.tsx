'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { MatrixRain } from '@/components/shared/matrix-rain';
import { useAppStore } from '@/store/use-app-store';

/**
 * Bridges next-themes "matrix" value to a CSS class on <html>.
 * Also renders matrix rain canvas while matrix mode is active.
 */
export function MatrixThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const accentColor = useAppStore((s) => s.accentColor);

  useEffect(() => {
    const isMatrix = theme === 'matrix';
    const root = document.documentElement;

    if (isMatrix) {
      root.classList.add('matrix');
    } else {
      root.classList.remove('matrix');
    }

    root.setAttribute('data-accent', accentColor || 'emerald');

    return () => {
      root.classList.remove('matrix');
    };
  }, [accentColor, theme]);

  return (
    <>
      {children}
      {theme === 'matrix' && <MatrixRain />}
    </>
  );
}

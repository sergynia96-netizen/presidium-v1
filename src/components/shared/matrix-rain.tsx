'use client';

import { useEffect, useRef } from 'react';

/**
 * Matrix digital rain background effect.
 * Renders falling green characters on a canvas behind app content.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const columnsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const fontSize = 14;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      const cols = Math.floor(width / fontSize);
      columnsRef.current = Array.from({ length: cols }, () => (Math.random() * height) / fontSize);
    };

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px monospace`;

      const cols = columnsRef.current;
      for (let i = 0; i < cols.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = cols[i] * fontSize;

        ctx.fillStyle = 'rgba(0, 255, 70, 0.9)';
        ctx.fillText(char, x, y);

        if (Math.random() > 0.98) {
          ctx.fillStyle = 'rgba(0, 255, 70, 1)';
          ctx.fillText(char, x, y);
        }

        if (y > height && Math.random() > 0.975) {
          cols[i] = 0;
        } else {
          cols[i]++;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none opacity-[0.08] z-0"
      aria-hidden="true"
    />
  );
}

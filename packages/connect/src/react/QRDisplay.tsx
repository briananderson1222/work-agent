// biome-ignore lint/correctness/noUnusedImports: React needed for classic JSX transform
import React, { useEffect, useRef } from 'react';

export interface QRDisplayProps {
  url: string;
  size?: number;
  label?: string;
}

/**
 * Renders a QR code canvas for the given URL.
 * Uses the `qrcode` npm package (dynamically imported to keep bundle lazy).
 */
export function QRDisplay({ url, size = 160, label }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    const canvas = canvasRef.current;

    // Dynamic import so bundlers can tree-shake if unused
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvas, url, {
        width: size,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        // Ignore render errors
      });
    });
  }, [url, size]);

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ borderRadius: 8, display: 'block' }}
      />
      {label && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-secondary, #999)',
            maxWidth: size,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

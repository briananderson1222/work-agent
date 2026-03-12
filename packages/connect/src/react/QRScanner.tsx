// biome-ignore lint/correctness/noUnusedImports: React needed for classic JSX transform
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface QRScannerProps {
  onScan: (url: string) => void;
  onCancel: () => void;
}

/**
 * Opens the device camera and scans QR codes using jsqr.
 * Calls onScan(url) when a valid http/https URL is decoded.
 */
export function QRScanner({ onScan, onCancel }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    stopStream();
    onCancel();
  }, [stopStream, onCancel]);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(
            new Error('Camera requires a secure context (HTTPS or localhost).'),
            { name: 'InsecureContext' },
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        scan();
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access.'
              : `Camera error: ${err.message}`,
          );
          setScanning(false);
        }
      }
    };

    const scan = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      import('jsqr').then(({ default: jsQR }) => {
        if (cancelled) return;
        const result = jsQR(imageData.data, imageData.width, imageData.height);
        if (result?.data) {
          const text = result.data.trim();
          if (text.startsWith('http://') || text.startsWith('https://')) {
            setScanning(false);
            stopStream();
            onScan(text);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      });
    };

    startCamera();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [onScan, stopStream]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 16,
      }}
    >
      {error ? (
        <div
          style={{
            color: 'var(--error-text, #ef4444)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                borderRadius: 8,
                background: '#000',
                display: scanning ? 'block' : 'none',
              }}
              playsInline
              muted
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {scanning && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '2px solid var(--accent-primary, #3b82f6)',
                  borderRadius: 8,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          {scanning && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--text-secondary, #999)',
                textAlign: 'center',
              }}
            >
              Point camera at a QR code containing a server URL
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={handleCancel}
        style={{
          padding: '8px 20px',
          fontSize: 13,
          borderRadius: 6,
          border: '1px solid var(--border-primary, #333)',
          background: 'transparent',
          color: 'var(--text-primary, #e5e5e5)',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

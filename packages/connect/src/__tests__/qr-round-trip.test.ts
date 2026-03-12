/**
 * QR round-trip test: encode a URL into a QR code, then decode it back with jsqr.
 * Validates that QRDisplay produces a scannable result without needing a real camera.
 *
 * Uses node-canvas to emulate browser Canvas API (jsdom doesn't implement it).
 */
// @vitest-environment node

import { createCanvas } from 'canvas'; // node-canvas — install as dev dep
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

const TEST_URL = 'http://192.168.1.42:3141';
const SIZE = 256;

describe('QR encode → decode round-trip', () => {
  it('encodes a server URL and jsqr reads it back exactly', async () => {
    // 1. Encode URL to canvas (same logic QRDisplay uses)
    const canvas = createCanvas(SIZE, SIZE);
    await QRCode.toCanvas(canvas as any, TEST_URL, {
      width: SIZE,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    // 2. Read pixels
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);

    // 3. Decode with jsqr (same library QRScanner uses)
    const result = jsQR(
      imageData.data as unknown as Uint8ClampedArray,
      imageData.width,
      imageData.height,
    );

    expect(result).not.toBeNull();
    expect(result!.data).toBe(TEST_URL);
  });

  it('handles URLs with paths and query strings', async () => {
    const url = 'http://192.168.1.1:3141/api/system/status?check=1';
    const canvas = createCanvas(SIZE, SIZE);
    await QRCode.toCanvas(canvas as any, url, { width: SIZE, margin: 2 });
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const result = jsQR(
      imageData.data as unknown as Uint8ClampedArray,
      imageData.width,
      imageData.height,
    );
    expect(result?.data).toBe(url);
  });

  it('handles localhost URLs', async () => {
    const url = 'http://localhost:3141';
    const canvas = createCanvas(SIZE, SIZE);
    await QRCode.toCanvas(canvas as any, url, { width: SIZE, margin: 2 });
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const result = jsQR(
      imageData.data as unknown as Uint8ClampedArray,
      imageData.width,
      imageData.height,
    );
    expect(result?.data).toBe(url);
  });

  it('smaller canvas (120px) still produces scannable QR', async () => {
    const canvas = createCanvas(120, 120);
    await QRCode.toCanvas(canvas as any, TEST_URL, { width: 120, margin: 1 });
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 120, 120);
    const result = jsQR(
      imageData.data as unknown as Uint8ClampedArray,
      120,
      120,
    );
    expect(result?.data).toBe(TEST_URL);
  });
});

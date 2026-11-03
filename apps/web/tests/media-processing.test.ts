import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { processImage, readDimensions } from '../lib/media/processing';
import { detectImageType } from '../lib/media/validation';

/**
 * Batch C — sharp 0.35.x regression tests for the image pipeline (lib/media/processing.ts).
 * Pure: images are generated in memory; no database, storage or binary fixtures.
 */
// RGBA fixtures are semi-transparent: a fully opaque alpha channel is legitimately dropped by the WebP encoder.
const solid = (w: number, h: number, channels: 3 | 4 = 3) =>
  sharp({ create: { width: w, height: h, channels, background: { r: 120, g: 60, b: 30, alpha: channels === 4 ? 0.5 : 1 } } });

const isWebp = (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';

/** A PNG that only DECLARES huge dimensions (valid IHDR with CRC, no pixel data). */
function headerOnlyPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
}

describe('Batch C — image pipeline on sharp 0.35.x', () => {
  it('runs on the patched sharp release (>= 0.35.5) with its bundled libvips', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'node_modules', 'sharp', 'package.json'), 'utf8'));
    const [maj, min, patch] = String(pkg.version).split('.').map(Number);
    expect(maj === 0 && (min > 35 || (min === 35 && patch >= 5)), `sharp ${pkg.version}`).toBe(true);
    expect(typeof sharp.versions.vips).toBe('string');
  });

  for (const fmt of ['jpeg', 'png', 'webp'] as const) {
    it(`${fmt}: produces WebP thumb/md/lg derivatives at the expected widths`, async () => {
      const input = await solid(2000, 1000)[fmt]().toBuffer();
      expect(detectImageType(input)?.format).toBe(fmt === 'jpeg' ? 'jpeg' : fmt);
      const r = await processImage(input);
      expect([r.width, r.height]).toEqual([2000, 1000]);
      expect(r.derivatives.map((d) => [d.name, d.width, d.height])).toEqual([['thumb', 320, 160], ['md', 768, 384], ['lg', 1600, 800]]);
      for (const d of r.derivatives) {
        expect(d.ext).toBe('webp');
        expect(isWebp(d.buffer), `${d.name} is WebP`).toBe(true);
        expect((await sharp(d.buffer).metadata()).format).toBe('webp');
      }
    });
  }

  it('never upscales: a small image yields only a thumb at its original size', async () => {
    const r = await processImage(await solid(200, 100).png().toBuffer());
    expect(r.derivatives.map((d) => [d.name, d.width, d.height])).toEqual([['thumb', 200, 100]]);
  });

  it('keeps transparency-capable input working (RGBA PNG)', async () => {
    const r = await processImage(await solid(900, 600, 4).png().toBuffer());
    expect(r.derivatives.map((d) => d.name)).toEqual(['thumb', 'md']);
    expect((await sharp(r.derivatives[0].buffer).metadata()).hasAlpha).toBe(true);
  });

  it('EXIF orientation: reports display dimensions and writes upright derivatives', async () => {
    const rotated = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await readDimensions(rotated)).toEqual({ width: 200, height: 400 });
    const r = await processImage(rotated);
    expect([r.derivatives[0].width, r.derivatives[0].height]).toEqual([200, 400]);
    expect((await sharp(r.derivatives[0].buffer).metadata()).orientation ?? 1).toBe(1);
  });

  it('strips EXIF (incl. GPS) and other metadata from every derivative; the original is untouched', async () => {
    const MARK = 'NFRGUIDE-EXIF-MARKER';
    const original = await solid(1800, 1200)
      .jpeg()
      .withExif({
        IFD0: { Copyright: MARK, Artist: MARK },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '36/1 6/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '115/1 10/1 0/1' },
      })
      .toBuffer();
    const om = await sharp(original).metadata();
    expect(om.exif && om.exif.includes(MARK)).toBe(true); // precondition: the input really carries EXIF/GPS

    const r = await processImage(original);
    expect(r.derivatives.length).toBe(3);
    for (const d of r.derivatives) {
      const m = await sharp(d.buffer).metadata();
      expect(m.exif, `${d.name} exif`).toBeUndefined();
      expect(m.xmp, `${d.name} xmp`).toBeUndefined();
      expect(m.icc ?? undefined, `${d.name} icc`).toBeUndefined();
      expect(d.buffer.includes(Buffer.from(MARK)), `${d.name} contains marker`).toBe(false);
      expect(d.buffer.includes(Buffer.from('GPS')), `${d.name} contains GPS`).toBe(false);
    }
    // Documented design (processing.ts): originals are stored byte-for-byte as uploaded.
    expect(original.includes(Buffer.from(MARK))).toBe(true);
  });

  it('rejects a file with a valid signature but a corrupt body (no silent success)', async () => {
    const good = await solid(600, 400).jpeg().toBuffer();
    const corrupt = Buffer.concat([good.subarray(0, 64), Buffer.alloc(4096, 0x41)]);
    expect(detectImageType(corrupt)?.format).toBe('jpeg'); // passes the signature check …
    await expect(processImage(corrupt)).rejects.toThrow(); // … but sharp refuses to process it
  });

  it('rejects an image whose declared dimensions exceed the pixel limit (decompression-bomb guard)', async () => {
    const bomb = headerOnlyPng(20_000, 20_000); // 400 MP > sharp default limitInputPixels (268,402,689)
    expect(detectImageType(bomb)?.format).toBe('png');
    await expect(processImage(bomb)).rejects.toThrow();
  });

  it('rejects random bytes', async () => {
    await expect(processImage(Buffer.from('not an image at all'))).rejects.toThrow();
  });
});

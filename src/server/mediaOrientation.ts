// File: ./src/server/mediaOrientation.ts
import fs from 'fs/promises';
import sharp from 'sharp';

/**
 * Single source of truth for EXIF orientation of media variant sources.
 *
 * `src/server/mediaValidation.ts` decodes every asset with `metadata.autoOrient`,
 * i.e. it always reasons about the DISPLAY-oriented pixel grid. Any code that
 * derives variants or reports `image_width` / `image_height` from a source
 * must therefore orient the pixels first, otherwise the two disagree by a 90°
 * transposition and publication fails with:
 *   - VARIANT_ASPECT_RATIO_MISMATCH  (one per populated variant field)
 *   - ASPECT_RATIO_MISMATCH          (declared image_width/image_height)
 *
 * Orientation is applied EXACTLY ONCE, here. Callers must not additionally
 * call `.rotate()` / `.autoOrient()` on the returned buffer, which would
 * double-rotate the image.
 */
export interface OrientedSource {
  /** Pixel data with the EXIF orientation baked in and the tag consumed. */
  buffer: Buffer;
  /** Display-oriented width in pixels. */
  width: number;
  /** Display-oriented height in pixels. */
  height: number;
  /** EXIF orientation found in the source; 1 means "already upright". */
  sourceOrientation: number;
  /** Raw, pre-rotation width in pixels (diagnostics only). */
  rawWidth: number;
  /** Raw, pre-rotation height in pixels (diagnostics only). */
  rawHeight: number;
  /** True when the buffer had to be re-encoded to apply a rotation. */
  rotated: boolean;
}

/**
 * Normalizes a variant source into a Buffer and bakes in its EXIF orientation.
 *
 * The input bytes are returned unchanged (same Buffer reference) when the
 * source is already upright, so the common case costs one extra metadata
 * parse and no re-encoding.
 *
 * Note: when a rotation IS applied the buffer is re-encoded, which means
 * `originals/` should keep the caller's own `originalBuffer` rather than this
 * one, to avoid compressing the master image.
 */
export async function orientMediaSource(input: Buffer | string | sharp.Sharp): Promise<OrientedSource> {
  // Read the orientation from the SOURCE, not from a re-derived buffer.
  // `sharp.toBuffer()` strips metadata by default, so converting a sharp instance
  // first would silently discard the EXIF tag and reintroduce the very bug this
  // module exists to prevent.
  const { rawInput, sourceOrientation, rawWidth, rawHeight } = await readSource(input);

  const rotated = sourceOrientation !== 1;
  const buffer = rotated
    ? await sharp(rawInput, { failOn: 'none' }).autoOrient().toBuffer()
    : rawInput;

  const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
  return {
    buffer,
    width: metadata.width || 0,
    height: metadata.height || 0,
    sourceOrientation,
    rawWidth,
    rawHeight,
    rotated,
  };
}

/**
 * Formats a single-line, human-readable orientation note for server logs.
 */
export function describeOrientationChange(label: string, oriented: OrientedSource): string {
  return (
    `[materializeVariantSet] ${label}: applied EXIF orientation ${oriented.sourceOrientation} -> upright ` +
    `(${oriented.rawWidth}x${oriented.rawHeight} => ${oriented.width}x${oriented.height})`
  );
}

const toBuffer = async (input: Buffer | string | sharp.Sharp): Promise<Buffer> => {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return fs.readFile(input);
  // `toBuffer()` strips metadata by default, which would silently discard the EXIF
  // orientation tag and reintroduce the very bug this module exists to prevent.
  // `withMetadata()` preserves the input metadata, so the tag survives the handoff.
  return input.withMetadata().toBuffer();
};

const readSource = async (
  input: Buffer | string | sharp.Sharp,
): Promise<{ rawInput: Buffer; sourceOrientation: number; rawWidth: number; rawHeight: number }> => {
  const rawInput = await toBuffer(input);
  const metadata = await sharp(rawInput, { failOn: 'none' }).metadata();
  return {
    rawInput,
    sourceOrientation: Number(metadata.orientation || 1),
    rawWidth: metadata.width || 0,
    rawHeight: metadata.height || 0,
  };
};

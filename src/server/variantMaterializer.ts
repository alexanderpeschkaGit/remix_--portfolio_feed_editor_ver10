import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { assertStateAcceptable } from './statePublishing.ts';
import { describeOrientationChange, orientMediaSource } from './mediaOrientation.ts';
import { MEDIA_VARIANTS, R2_CONFIG, V2_MEDIA_GROUPS, V2_PREFIX, getBufferSha1, getContentTypeForPath, s3Client, uploadToR2 } from './serverContext.ts';
import { updateSyncManifestEntries } from './r2StorageService.ts';

  export const toPosix = (value: string) => value.replace(/\\/g, '/');
  export const joinUrlPath = (...parts: string[]) => `/${parts.map(part => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
  export const normalizeExt = (ext?: string) => {
    const clean = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean || 'jpg';
  };

  export const normalizeUploadedImage = async (file: Express.Multer.File) => {
    const originalExt = normalizeExt(path.extname(file.originalname || '').slice(1));
    const metadata = await sharp(file.buffer, { failOn: 'none' }).metadata();
    const inputFormat = String(metadata.format || originalExt).toLowerCase();
    const convertToJpeg = inputFormat === 'png' || inputFormat === 'tiff' || originalExt === 'tif' || originalExt === 'tiff';

    if (!convertToJpeg) {
      // JPEG/WebP pass through untouched. EXIF orientation is intentionally NOT
      // applied here: materializeVariantSet derives every variant (and the reported
      // sourceWidth/sourceHeight) from a single auto-oriented buffer, so rotating at
      // this stage too would double-rotate and the original would be re-compressed.
      return { buffer: file.buffer, ext: originalExt, inputFormat, convertedToJpeg: false };
    }

    // PNG/TIFF -> JPEG. Flattening alpha onto white is required before JPEG encoding.
    // No .rotate(): orientation is handled once, centrally, in materializeVariantSet.
    const buffer = await sharp(file.buffer, { failOn: 'none' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();

    return { buffer, ext: 'jpg', inputFormat, convertedToJpeg: true };
  };
  export const getGroupBaseDir = (group: keyof typeof V2_MEDIA_GROUPS) => V2_MEDIA_GROUPS[group];
  export const getVariantLocalPath = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    path.join(getGroupBaseDir(group), dir, filename);
  export const getVariantLocalUrl = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    joinUrlPath('data_v2', group, dir, filename);
  export const getVariantR2Key = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    `${V2_PREFIX}/${group}/${dir}/${filename}`;

  // Materialize a variant set. The source may arrive as a Buffer, a file path or an
  // existing sharp instance; orientMediaSource resolves all three to bytes and bakes
  // in the EXIF orientation. That single oriented buffer is then the source of truth
  // for BOTH the reported sourceWidth/sourceHeight and every generated variant, so a
  // transposed variant (and a 90-degree aspect-ratio validation failure) cannot occur.
  export const materializeVariantSet = async (
    input: sharp.Sharp | Buffer | string,
    options: {
      group: keyof typeof V2_MEDIA_GROUPS;
      baseName: string;
      originalBuffer?: Buffer;
      originalExt?: string;
      uploadToCloud?: boolean;
      writeFiles?: boolean;
    }
  ) => {
    const oriented = await orientMediaSource(input);
    if (oriented.rotated) {
      console.log(describeOrientationChange(options.baseName, oriented));
    }
    const orientedBuffer = oriented.buffer;
    const sourceWidth = oriented.width;
    const sourceHeight = oriented.height;
    const sourceMaxSide = Math.max(sourceWidth, sourceHeight);
    const localUrls: Record<string, string> = {};
    const remoteUrls: Record<string, string> = {};
    const localPaths: Record<string, string> = {};
    const missingVariants: string[] = [];
    const manifestEntries: Array<{ r2Key: string; hash: string; size: number }> = [];

    if (options.originalBuffer) {
      const originalFilename = `${options.baseName}_original.${normalizeExt(options.originalExt)}`;
      const originalPath = getVariantLocalPath(options.group, 'originals', originalFilename);
      if (options.writeFiles !== false) {
        await fs.writeFile(originalPath, options.originalBuffer);
        localPaths.image_original = originalPath;
      }
      localUrls.image_original = getVariantLocalUrl(options.group, 'originals', originalFilename);

      if (options.uploadToCloud) {
        const r2Key = getVariantR2Key(options.group, 'originals', originalFilename);
        remoteUrls.image_original = await uploadToR2(options.originalBuffer, r2Key, getContentTypeForPath(originalFilename));
        manifestEntries.push({ r2Key, hash: getBufferSha1(options.originalBuffer), size: options.originalBuffer.length });
      }
    }

    for (const variant of MEDIA_VARIANTS) {
      if (!variant.alwaysCreate && sourceMaxSide < variant.maxSide) {
        missingVariants.push(variant.field);
        continue;
      }

      const filename = `${options.baseName}_${variant.suffix}.jpg`;
      const buffer = await sharp(orientedBuffer, { failOn: 'none' })
        .resize(variant.maxSide, variant.maxSide, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: variant.quality })
        .toBuffer();

      const localPath = getVariantLocalPath(options.group, variant.dir, filename);
      if (options.writeFiles !== false) {
        await fs.writeFile(localPath, buffer);
        localPaths[variant.field] = localPath;
      }
      localUrls[variant.field] = getVariantLocalUrl(options.group, variant.dir, filename);

      if (options.uploadToCloud) {
        const r2Key = getVariantR2Key(options.group, variant.dir, filename);
        remoteUrls[variant.field] = await uploadToR2(buffer, r2Key, 'image/jpeg');
        manifestEntries.push({ r2Key, hash: getBufferSha1(buffer), size: buffer.length });
      }
    }

    return { sourceMaxSide, sourceWidth, sourceHeight, localUrls, remoteUrls, localPaths, missingVariants, manifestEntries };
  };

  export const publishHtmlAndState = async (htmlContent: string, stateData: string) => {
    await assertStateAcceptable(stateData, { rootDir: process.cwd(), allowNetwork: true });
    const indexBuffer = Buffer.from(htmlContent);
    const stateBuffer = Buffer.from(stateData);
    const revision = `${new Date().toISOString().replace(/[:.]/g, '-')}-${createHash('sha256').update(stateBuffer).update(indexBuffer).digest('hex').slice(0, 12)}`;
    const revisionPrefix = `revisions/${revision}`;
    const objects = [
      { liveKey: 'state.json', revisionKey: `${revisionPrefix}/state.json`, body: stateBuffer, contentType: 'application/json; charset=utf-8' },
      { liveKey: 'index.html', revisionKey: `${revisionPrefix}/index.html`, body: indexBuffer, contentType: 'text/html; charset=utf-8' },
    ];

    const previous = new Map<string, { body: Buffer; contentType: string } | null>();
    for (const object of objects) {
      try {
        const current = await s3Client.send(new GetObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey }));
        previous.set(object.liveKey, {
          body: Buffer.from(await current.Body!.transformToByteArray()),
          contentType: current.ContentType || object.contentType,
        });
      } catch (error: any) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) previous.set(object.liveKey, null);
        else throw error;
      }
    }

    // Upload and verify an immutable revision before changing either live key.
    for (const object of objects) {
      await s3Client.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.revisionKey, Body: object.body, ContentType: object.contentType }));
      await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.revisionKey }));
    }

    const promoted: string[] = [];
    try {
      for (const object of objects) {
        const copySource = `${R2_CONFIG.bucketName}/${object.revisionKey.split('/').map(encodeURIComponent).join('/')}`;
        await s3Client.send(new CopyObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey, CopySource: copySource }));
        await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey }));
        promoted.push(object.liveKey);
      }
    } catch (error) {
      // Restore the exact previous live pair if promotion is interrupted.
      for (const liveKey of promoted.reverse()) {
        const old = previous.get(liveKey);
        if (old) {
          await s3Client.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: liveKey, Body: old.body, ContentType: old.contentType }));
        } else {
          await s3Client.send(new DeleteObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: liveKey }));
        }
      }
      throw error;
    }
  };


  export const uploadVariantSetToR2 = async (
    variantSet: {
      localPaths: Record<string, string>;
      localUrls: Record<string, string>;
    },
    options: {
      group: keyof typeof V2_MEDIA_GROUPS;
      originalBuffer?: Buffer;
      originalExt?: string;
    }
  ) => {
    const remoteUrls: Record<string, string> = {};
    const manifestEntries: Array<{ r2Key: string; hash: string; size: number }> = [];
    const uploadErrors: string[] = [];

    if (options.originalBuffer && variantSet.localPaths.image_original) {
      try {
        const originalFilename = path.basename(variantSet.localPaths.image_original);
        const originalR2Key = getVariantR2Key(options.group, 'originals', originalFilename);
        remoteUrls.image_original = await uploadToR2(
          options.originalBuffer,
          originalR2Key,
          getContentTypeForPath(originalFilename)
        );
        manifestEntries.push({
          r2Key: originalR2Key,
          hash: getBufferSha1(options.originalBuffer),
          size: options.originalBuffer.length,
        });
      } catch (error: any) {
        uploadErrors.push(`image_original: ${error.message || error}`);
      }
    }

    for (const variant of MEDIA_VARIANTS) {
      const localPath = variantSet.localPaths[variant.field];
      if (!localPath) continue;

      try {
        const buffer = await fs.readFile(localPath);
        const filename = path.basename(localPath);
        const r2Key = getVariantR2Key(options.group, variant.dir, filename);
        remoteUrls[variant.field] = await uploadToR2(buffer, r2Key, getContentTypeForPath(localPath));
        manifestEntries.push({
          r2Key,
          hash: getBufferSha1(buffer),
          size: buffer.length,
        });
      } catch (error: any) {
        uploadErrors.push(`${variant.field}: ${error.message || error}`);
      }
    }

    if (manifestEntries.length > 0) {
      await updateSyncManifestEntries(manifestEntries);
    }

    return { remoteUrls, manifestEntries, uploadErrors };
  };


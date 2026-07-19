// File: ./src/server/statePublishing.ts
import { validateMediaState, type MediaValidationReport, type ValidateMediaStateOptions } from './mediaValidation.ts';
import { createHash } from 'crypto';

const validationCache = new Map<string, { expiresAt: number; report: MediaValidationReport }>();

function validationFingerprint(state: any, options: ValidateMediaStateOptions) {
  const fields = ['type', 'image', 'image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_large', 'image_original', 'image_width', 'image_height', 'url', 'link'];
  const compact = (media: any) => Object.fromEntries(fields.map(field => [field, media?.[field] ?? null]));
  const mediaState = (state?.items || []).map((item: any) => ({
    id: item.id,
    media: Array.isArray(item.mergedMedia) && item.mergedMedia.length ? item.mergedMedia.map(compact) : [compact(item)],
  }));
  return createHash('sha256').update(JSON.stringify({ mediaState, allowNetwork: options.allowNetwork !== false, rootDir: options.rootDir || '' })).digest('hex');
}

export class StateValidationError extends Error {
  report: MediaValidationReport;

  constructor(report: MediaValidationReport) {
    super(`State media validation failed with ${report.errorCount} error(s).`);
    this.name = 'StateValidationError';
    this.report = report;
  }
}

export function parseStateData(stateData: string | object) {
  if (typeof stateData === 'string') return JSON.parse(stateData);
  return stateData;
}

export async function assertStateAcceptable(stateData: string | object, options: ValidateMediaStateOptions = {}) {
  const state = parseStateData(stateData);
  const validationOptions = {
    includeTopLevelReferences: false,
    reportMissingOptionalVariants: true,
    ...options,
  };
  const cacheKey = validationFingerprint(state, validationOptions);
  const cached = options.resolver ? undefined : validationCache.get(cacheKey);
  const report = cached && cached.expiresAt > Date.now()
    ? cached.report
    : await validateMediaState(state, validationOptions);
  if (!options.resolver) {
    validationCache.set(cacheKey, { expiresAt: Date.now() + 60_000, report });
    while (validationCache.size > 10) validationCache.delete(validationCache.keys().next().value!);
  }
  if (!report.ok) throw new StateValidationError(report);
  return { state, report };
}

export function stateValidationHttpPayload(error: unknown) {
  if (error instanceof StateValidationError) {
    return {
      status: 422,
      body: {
        error: error.message,
        code: 'STATE_MEDIA_VALIDATION_FAILED',
        validation: error.report,
      },
    };
  }
  return null;
}

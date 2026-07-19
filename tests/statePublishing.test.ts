// File: ./tests/statePublishing.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { assertStateAcceptable, StateValidationError } from '../src/server/statePublishing.ts';

const square = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#225588' } }).jpeg().toBuffer();

test('acceptance gate blocks structural corruption with a structured report', async () => {
  const state = { items: [{ id: 'broken', image_thumb: 'https://fixture.test/caption.txt', image_width: 400, image_height: 400 }] };
  await assert.rejects(
    assertStateAcceptable(state, { resolver: async () => ({ buffer: square, contentType: 'text/plain' }) }),
    (error: any) => {
      assert(error instanceof StateValidationError);
      assert(error.report.issues.some((issue: any) => issue.code === 'NON_IMAGE_EXTENSION'));
      return true;
    },
  );
});

test('acceptance gate does not warn about variants larger than the verified source', async () => {
  const state = { items: [{ id: 'legacy', image_thumb: 'https://fixture.test/thumb.jpg', image_width: 400, image_height: 400 }] };
  const result = await assertStateAcceptable(state, { resolver: async () => ({ buffer: square, contentType: 'image/jpeg' }) });
  assert.equal(result.report.errorCount, 0);
  assert.equal(result.report.warningCount, 0);
});

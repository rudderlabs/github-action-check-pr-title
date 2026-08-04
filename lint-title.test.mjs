import assert from 'node:assert/strict';
import test from 'node:test';

import { lintTitle } from './lint-title.mjs';

test('accepts a conventional title without a breaking-change marker', async () => {
  const report = await lintTitle('fix: correct title validation');

  assert.equal(report.valid, true);
});

test('accepts breaking-change markers without a scope', async () => {
  const report = await lintTitle('feat!: change the public API');

  assert.equal(report.valid, true);
});

test('accepts breaking-change markers with a scope', async () => {
  const report = await lintTitle('feat(api)!: change the public API');

  assert.equal(report.valid, true);
});

test('continues to reject malformed titles', async () => {
  const report = await lintTitle('feat(api)! change the public API');

  assert.equal(report.valid, false);
});

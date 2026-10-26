import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeWorkflowCommands } from './log-safe.mjs';

test('breaks ##[ anywhere in the text', () => {
  const escaped = escapeWorkflowCommands('fix: a ##[group]b ##[endgroup]');
  assert.doesNotMatch(escaped, /##\[/);
  assert.equal(escaped.replaceAll('​', ''), 'fix: a ##[group]b ##[endgroup]');
});

test('breaks every ::, after any line break or whitespace', () => {
  const text = '::add-mask::x\n  ::error::y\r\u0085::warning::z\r\n\u00a0::notice::w\u2028::debug::v';
  const escaped = escapeWorkflowCommands(text);
  assert.doesNotMatch(escaped, /::/);
  assert.equal(escaped.replaceAll('\u200B', ''), text);
});

test('keeps ordinary text unchanged', () => {
  assert.equal(escapeWorkflowCommands("feat(api): add ## headers and a: b"), 'feat(api): add ## headers and a: b');
});

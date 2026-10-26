import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeWorkflowCommands } from './log-safe.mjs';

const ZERO_WIDTH_SPACE = '\u200B';

function assertEscaped(text) {
  const escaped = escapeWorkflowCommands(text);
  assert.doesNotMatch(escaped, /::|##\[/);
  assert.equal(escaped.replaceAll(ZERO_WIDTH_SPACE, ''), text);
}

test('breaks ##[ anywhere in the text', () => {
  assertEscaped('fix: a ##[group]b ##[endgroup]');
  assertEscaped('##[[x');
  assertEscaped('###[x');
});

test('breaks every ::, after any line break or whitespace', () => {
  assertEscaped('::add-mask::x\n  ::error::y\r\u0085::warning::z\r\n\u00a0::notice::w\u2028::debug::v');
});

test('breaks runs of three or more colons', () => {
  assertEscaped(':::add-mask::x');
  assertEscaped('::::');
});

test('keeps ordinary text unchanged', () => {
  assert.equal(escapeWorkflowCommands('feat(api): add ## headers and a: b'), 'feat(api): add ## headers and a: b');
});

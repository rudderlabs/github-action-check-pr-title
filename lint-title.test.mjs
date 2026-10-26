import assert from 'node:assert/strict';
import test from 'node:test';

import { isBotPullRequest, lintTitle } from './lint-title.mjs';

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

// Real titles from rudderlabs bot PRs (October 2026) that the rules reject.
const botTitles = [
  ['dependabot[bot]', 'chore(deps): bump langgraph-checkpoint-sqlite from 3.1.1 to 3.1.2 in /examples/langgraph-checkpoint in the pip group across 1 directory'],
  ['dependabot[bot]', 'build(deps): Bump the actions group with 2 updates'],
  ['dependabot[bot]', 'deps(deps): bump certifi from 2024.7.4 to 2026.10.19'],
  ['dependabot[bot]', 'Bump follow-redirects from 1.16.0 to 1.16.1 in the npm_and_yarn group across 1 directory'],
  ['github-actions[bot]', 'chore: Update operator version to v2.98.0'],
  ['rudderstack-github-actions[bot]', '[Drift Detection] 2026-10-21'],
];

for (const [login, title] of botTitles) {
  test(`skips the ${login} title '${title}'`, async () => {
    const report = await lintTitle(title);

    assert.equal(report.valid, false);
    assert.equal(isBotPullRequest({ title, user: { login, type: 'Bot' } }), true);
  });
}

test('checks pull requests from people', () => {
  assert.equal(isBotPullRequest({ user: { login: 'octocat', type: 'User' } }), false);
});

test('checks pull requests that carry no author', () => {
  assert.equal(isBotPullRequest({}), false);
  assert.equal(isBotPullRequest(undefined), false);
});

test('accepts the release-please title', async () => {
  const report = await lintTitle('chore(master): release 0.26.0');

  assert.equal(report.valid, true);
});

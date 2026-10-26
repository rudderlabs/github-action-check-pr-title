import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const longTitle =
  'chore(deps): bump langgraph-checkpoint-sqlite from 3.1.1 to 3.1.2 in /examples/langgraph-checkpoint in the pip group across 1 directory';

function runAction(pullRequest) {
  const dir = mkdtempSync(join(tmpdir(), 'check-pr-title-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest }));

  return spawnSync(process.execPath, ['index.mjs'], {
    cwd: import.meta.dirname,
    env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
    encoding: 'utf8',
  });
}

test('passes a bot pull request whose title breaks the rules', () => {
  const result = runAction({ title: longTitle, user: { login: 'dependabot[bot]', type: 'Bot' } });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Skipping: the author dependabot\[bot\] is a bot/);
});

test('fails the same title from a person', () => {
  const result = runAction({ title: longTitle, user: { login: 'octocat', type: 'User' } });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /header-max-length/);
});

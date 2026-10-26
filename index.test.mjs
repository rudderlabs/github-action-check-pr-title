import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

const longTitle =
  'chore(deps): bump langgraph-checkpoint-sqlite from 3.1.1 to 3.1.2 in /examples/langgraph-checkpoint in the pip group across 1 directory';

function pullRequest(fields) {
  return {
    number: 7,
    title: 'fix: correct title validation',
    labels: [],
    user: { login: 'octocat', type: 'User' },
    head: { sha: 'abc123' },
    base: { user: { login: 'rudderlabs' }, repo: { name: 'demo' } },
    ...fields,
  };
}

// Inputs use the runner's names, e.g. { TYPES: 'fix' } becomes INPUT_TYPES.
function runAction({ eventName = 'pull_request', payload, inputs = {}, env = {}, timeout }) {
  const dir = mkdtempSync(join(tmpdir(), 'check-pr-title-'));
  const eventPath = join(dir, 'event.json');
  const outputPath = join(dir, 'output');
  writeFileSync(eventPath, JSON.stringify(payload));
  writeFileSync(outputPath, '');

  const inputEnv = Object.fromEntries(Object.entries(inputs).map(([name, value]) => [`INPUT_${name}`, value]));
  const { GITHUB_TOKEN, ...parentEnv } = process.env;

  return new Promise((resolve) => {
    // CI sets ACTION_ENTRY=dist/index.mjs to test the bundle the action runs.
    const child = spawn(process.execPath, [process.env.ACTION_ENTRY ?? 'index.mjs'], {
      cwd: import.meta.dirname,
      // A hung action is killed, so the test fails instead of waiting for it.
      timeout,
      env: {
        ...parentEnv,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        ...inputEnv,
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr, output: readFileSync(outputPath, 'utf8') }));
  });
}

describe('without a token, from the event payload', () => {
  test('passes a bot pull request whose title breaks the rules', async () => {
    const result = await runAction({
      payload: { pull_request: pullRequest({ title: 'Bump follow-redirects', user: { login: 'dependabot[bot]', type: 'Bot' } }) },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Skipping: the author dependabot\[bot\] is a bot/);
  });

  test('fails the same title from a person', async () => {
    const result = await runAction({ payload: { pull_request: pullRequest({ title: 'Bump follow-redirects' }) } });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /::error::No release type found in pull request title "Bump follow-redirects"/);
    assert.match(result.output, /error_message<</);
  });

  test('passes a title longer than 100 characters, as amannn does', async () => {
    const result = await runAction({ payload: { pull_request: pullRequest({ title: longTitle }) } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('applies types and scopes inputs', async () => {
    const result = await runAction({
      payload: { pull_request: pullRequest({ title: 'feat(router): add retries' }) },
      inputs: { TYPES: 'fix\nfeat', SCOPES: 'core\nwarehouse' },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Unknown scope "router"/);
  });

  test('writes the type, scope and subject outputs', async () => {
    const result = await runAction({ payload: { pull_request: pullRequest({ title: 'feat(router): add retries' }) } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.output, /type<<.*\nfeat\n/);
    assert.match(result.output, /scope<<.*\nrouter\n/);
    assert.match(result.output, /subject<<.*\nadd retries\n/);
    assert.match(result.output, /breaking<<.*\nfalse\n/);
  });

  test('reports a breaking change in the breaking output', async () => {
    const result = await runAction({ payload: { pull_request: pullRequest({ title: 'feat(api)!: drop v1' }) } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.output, /breaking<<.*\ntrue\n/);
  });

  test('skips validation when the pull request carries an ignored label', async () => {
    const result = await runAction({
      payload: { pull_request: pullRequest({ title: 'Bump follow-redirects', labels: [{ name: 'dependencies' }] }) },
      inputs: { IGNORELABELS: 'bot\ndependencies' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Validation was skipped because the PR label "dependencies" was found/);
  });

  test('fails with a clear message when wip needs a token', async () => {
    const result = await runAction({ payload: { pull_request: pullRequest() }, inputs: { WIP: 'true' } });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /`wip` and `validateSingleCommit` need the GITHUB_TOKEN environment variable/);
  });

  test('passes a merge_group event, which has no pull request', async () => {
    const result = await runAction({ eventName: 'merge_group', payload: { merge_group: { head_sha: 'abc' } } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Skipping: a merge_group event has no pull request title/);
  });

  test('fails with a clear message on an event without a pull request', async () => {
    const result = await runAction({ eventName: 'push', payload: { ref: 'refs/heads/main' } });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /::error::The 'push' event has no pull request/);
    assert.doesNotMatch(result.stderr, /TypeError/);
  });
});

describe('with a token, from the GitHub API', () => {
  let server;
  let baseUrl;
  let api;

  before(async () => {
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const route = `${request.method} ${request.url}`;
        api.requests.push({ route, authorization: request.headers.authorization, body: body && JSON.parse(body) });
        const reply = {
          'GET /repos/rudderlabs/demo/pulls/7': api.pullRequest,
          'GET /repos/rudderlabs/demo/pulls/7/commits': api.commits,
          'POST /repos/rudderlabs/demo/statuses/abc123': {},
          'POST /repos/rudderlabs/demo/statuses/mq123': {},
        }[route];
        response.writeHead(reply ? 200 : 404, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply ?? { message: 'Not Found' }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  function runWithApi({ pullRequest: current, commits = [], inputs = {}, env = { GITHUB_TOKEN: 'test-token' }, timeout }) {
    api = { pullRequest: current, commits, requests: [] };
    return runAction({
      // The payload title is stale, as when a person retitles and re-runs the job.
      payload: { pull_request: pullRequest({ title: 'stale title' }) },
      inputs: { GITHUBBASEURL: baseUrl, ...inputs },
      env,
      timeout,
    });
  }

  function commit(message, parents = 1) {
    return { commit: { message }, parents: Array.from({ length: parents }, () => ({})) };
  }

  test('validates the current title from the API, not the stale payload', async () => {
    const result = await runWithApi({ pullRequest: pullRequest({ title: 'fix: current title' }) });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.output, /subject<<.*\ncurrent title\n/);
  });

  test('takes the token from the githubToken input', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: current title' }),
      inputs: { GITHUBTOKEN: 'input-token' },
      env: {},
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(api.requests[0].authorization, 'token input-token');
  });

  test('prefers the GITHUB_TOKEN environment variable over the input', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: current title' }),
      inputs: { GITHUBTOKEN: 'input-token' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(api.requests[0].authorization, 'token test-token');
  });

  test('reads ignored labels from the API', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'not semantic', labels: [{ name: 'bot' }] }),
      inputs: { IGNORELABELS: 'bot' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('marks a [WIP] pull request pending and passes', async () => {
    const result = await runWithApi({ pullRequest: pullRequest({ title: '[WIP] not semantic' }), inputs: { WIP: 'true' } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const status = api.requests.find(({ route }) => route.startsWith('POST'));
    assert.equal(status.body.state, 'pending');
    // Branch protection rules that require amannn's status keep working.
    assert.equal(status.body.context, 'action-semantic-pull-request');
  });

  test('marks a valid pull request successful when wip is on', async () => {
    const result = await runWithApi({ pullRequest: pullRequest({ title: 'fix: done' }), inputs: { WIP: 'true' } });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(api.requests.find(({ route }) => route.startsWith('POST')).body.state, 'success');
  });

  // Repositories that require the wip status must still get it when the check is skipped.
  test('marks a skipped bot pull request successful when wip is on', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'Bump follow-redirects', user: { login: 'dependabot[bot]', type: 'Bot' } }),
      inputs: { WIP: 'true' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const status = api.requests.find(({ route }) => route.startsWith('POST'));
    assert.equal(status.route, 'POST /repos/rudderlabs/demo/statuses/abc123');
    assert.equal(status.body.state, 'success');
    assert.equal(status.body.context, 'action-semantic-pull-request');
  });

  test('marks a pull request skipped by label successful when wip is on', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'not semantic', labels: [{ name: 'bot' }] }),
      inputs: { WIP: 'true', IGNORELABELS: 'bot' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(api.requests.find(({ route }) => route.startsWith('POST')).body.state, 'success');
  });

  test('marks the merge queue commit successful when wip is on', async () => {
    api = { requests: [] };
    const result = await runAction({
      eventName: 'merge_group',
      payload: { merge_group: { head_sha: 'mq123' } },
      inputs: { GITHUBBASEURL: baseUrl, WIP: 'true' },
      env: { GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'rudderlabs/demo' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const status = api.requests.find(({ route }) => route.startsWith('POST'));
    assert.equal(status.route, 'POST /repos/rudderlabs/demo/statuses/mq123');
    assert.equal(status.body.state, 'success');
  });

  test('keeps the outputs from the title when it validates the single commit', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'feat!: remove v1' }),
      commits: [commit('fix: remove v1')],
      inputs: { VALIDATESINGLECOMMIT: 'true' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.output, /type<<.*\nfix\n/);
    assert.doesNotMatch(result.output, /breaking<<.*\nfalse\n/);
  });

  test('reports the single-commit failure in error_message', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit('wip')],
      inputs: { VALIDATESINGLECOMMIT: 'true' },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.output, /error_message<<.*\nPull request has only one commit and it's not semantic/);
  });

  test('fails a single non-semantic commit when validateSingleCommit is on', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit('wip'), commit('Merge branch main', 2)],
      inputs: { VALIDATESINGLECOMMIT: 'true' },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Pull request has only one commit and it's not semantic/);
  });

  test('fails a single commit whose title differs from the pull request title', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit('fix: something else\n\nbody')],
      inputs: { VALIDATESINGLECOMMIT: 'true', VALIDATESINGLECOMMITMATCHESPRTITLE: 'true' },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /The pull request title doesn't match the commit though/);
  });

  test('validates a single commit with a 40 KB body', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit(`fix: done\n\n${'a'.repeat(40 * 1024)}`)],
      inputs: { VALIDATESINGLECOMMIT: 'true', VALIDATESINGLECOMMITMATCHESPRTITLE: 'true' },
      timeout: 10_000,
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('matches a single CRLF commit against the pull request title', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit('fix: done\r\n\r\nbody')],
      inputs: { VALIDATESINGLECOMMIT: 'true', VALIDATESINGLECOMMITMATCHESPRTITLE: 'true' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('names the length limit when the single commit header is too long', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit(`fix: ${'a'.repeat(1000)}`)],
      inputs: { VALIDATESINGLECOMMIT: 'true' },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /its commit header is longer than 1000 characters/);
  });

  test('ignores the commit when the pull request has two non-merge commits', async () => {
    const result = await runWithApi({
      pullRequest: pullRequest({ title: 'fix: done' }),
      commits: [commit('wip'), commit('more wip')],
      inputs: { VALIDATESINGLECOMMIT: 'true' },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Worker } from 'node:worker_threads';

import { formatMessage, HEADER_TOO_LONG, isBotPullRequest, MAX_HEADER_LENGTH, validatePrTitle } from './validate-pr-title.mjs';

// Ported from amannn/action-semantic-pull-request so the two actions agree on every title.

async function assertRejects(title, options, expected) {
  await assert.rejects(validatePrTitle(title, options), (error) => {
    if (expected instanceof RegExp) {
      assert.match(error.message, expected);
    } else {
      assert.ok(error.message.includes(expected), `"${error.message}" does not include "${expected}"`);
    }
    return true;
  });
}

test('allows valid PR titles that use the default types', async () => {
  for (const title of ['fix: Fix bug', 'fix!: Fix bug', 'feat: Add feature', 'feat!: Add feature', 'refactor: Internal cleanup']) {
    await validatePrTitle(title);
  }
});

test('throws for PR titles without a type', async () => {
  await assertRejects('Fix bug', undefined, 'No release type found in pull request title "Fix bug".');
});

test('throws for PR titles with only a type', async () => {
  await assertRejects('fix:', undefined, 'No release type found in pull request title "fix:".');
});

test('throws for PR titles without a subject', async () => {
  await assertRejects('fix: ', undefined, 'No subject found in pull request title "fix: ".');
});

test('throws for PR titles with an unknown type', async () => {
  await assertRejects('foo: Bar', undefined, 'Unknown release type "foo" found in pull request title "foo: Bar".');
});

describe('regex types', () => {
  const headerPattern = /^([\w-]*)(?:\(([\w$.\-*/ ]*)\))?: (.*)$/;
  const types = ['JIRA-\\d+'];

  test('allows a regex matching type', async () => {
    await validatePrTitle('JIRA-123: Bar', { types, headerPattern });
  });

  test('can be used for dynamic Jira keys', async () => {
    for (const key of ['JIRA-123', 'P-123', 'INT-31', 'CONF-0']) {
      await validatePrTitle(`${key}: did the thing`, { types: ['[A-Z]+-\\d+'], headerPattern });
    }
  });

  test('throws for PR titles without a type', async () => {
    await assertRejects('Fix JIRA-123 bug', { types, headerPattern }, 'No release type found in pull request title "Fix JIRA-123 bug".');
  });

  test('throws for PR titles with only a type', async () => {
    await assertRejects('JIRA-123:', { types, headerPattern }, 'No release type found in pull request title "JIRA-123:".');
  });

  test('throws for PR titles without a subject', async () => {
    await assertRejects('JIRA-123: ', { types, headerPattern }, 'No subject found in pull request title "JIRA-123: ".');
  });

  test('throws for PR titles that do not match the regex', async () => {
    await assertRejects('CONF-123: ', { types, headerPattern }, 'No subject found in pull request title "CONF-123: ".');
  });

  test('throws when an unknown type is detected for auto-wrapping regex', async () => {
    await assertRejects(
      'JIRA-123A: Bar',
      { types, headerPattern },
      'Unknown release type "JIRA-123A" found in pull request title "JIRA-123A: Bar".\n\nAvailable types:\n - JIRA-\\d+',
    );
  });

  test('parses a breaking title with the custom headerPattern, not the preset', async () => {
    const options = { headerPattern: '^(\\w+)!?: (.*)$', headerPatternCorrespondence: ['type', 'subject'] };
    await validatePrTitle('feat: remove v1', options);
    await validatePrTitle('feat!: remove v1', options);
  });

  test('allows scopes when using a regex for the type', async () => {
    await validatePrTitle('JIRA-123(core): Bar', { types, headerPattern });
  });
});

describe('defined scopes', () => {
  test('allows a missing scope by default', async () => {
    await validatePrTitle('fix: Bar');
  });

  test('allows all scopes by default', async () => {
    await validatePrTitle('fix(core): Bar');
  });

  test('allows a missing scope when custom scopes are defined', async () => {
    await validatePrTitle('fix: Bar', { scopes: ['foo'] });
  });

  test('allows a matching scope', async () => {
    await validatePrTitle('fix(core): Bar', { scopes: ['core'] });
  });

  test('allows a regex matching scope', async () => {
    await validatePrTitle('fix(CORE): Bar', { scopes: ['[A-Z]+'] });
  });

  test('allows multiple matching scopes', async () => {
    await validatePrTitle('fix(core,e2e): Bar', { scopes: ['core', 'e2e', 'web'] });
  });

  test('allows multiple regex matching scopes', async () => {
    await validatePrTitle('fix(CORE,WEB): Bar', { scopes: ['[A-Z]+'] });
  });

  test('throws when an unknown scope is detected within multiple scopes', async () => {
    await assertRejects(
      'fix(core,e2e,foo,bar): Bar',
      { scopes: ['foo', 'core'] },
      'Unknown scopes "e2e,bar" found in pull request title "fix(core,e2e,foo,bar): Bar". Scope must match one of: foo, core.',
    );
  });

  test('throws when an unknown scope is detected within multiple scopes and a regex', async () => {
    await assertRejects(
      'fix(CORE,e2e,foo,bar): Bar',
      { scopes: ['foo', '[A-Z]+'] },
      'Unknown scopes "e2e,bar" found in pull request title "fix(CORE,e2e,foo,bar): Bar". Scope must match one of: foo, [A-Z]+.',
    );
  });

  test('throws when an unknown scope is detected', async () => {
    await assertRejects(
      'fix(core): Bar',
      { scopes: ['foo'] },
      'Unknown scope "core" found in pull request title "fix(core): Bar". Scope must match one of: foo.',
    );
  });

  test('throws when an unknown scope is detected for auto-wrapped regex matching', async () => {
    await assertRejects(
      'fix(score): Bar',
      { scopes: ['core'] },
      'Unknown scope "score" found in pull request title "fix(score): Bar". Scope must match one of: core.',
    );
  });

  test('throws when an unknown scope is detected for auto-wrapped regex matching when input is already wrapped', async () => {
    await assertRejects(
      'fix(score): Bar',
      { scopes: ['^[A-Z]+$'] },
      'Unknown scope "score" found in pull request title "fix(score): Bar". Scope must match one of: ^[A-Z]+$.',
    );
  });

  test('throws when an unknown scope is detected for regex matching', async () => {
    await assertRejects(
      'fix(core): Bar',
      { scopes: ['[A-Z]+'] },
      'Unknown scope "core" found in pull request title "fix(core): Bar". Scope must match one of: [A-Z]+.',
    );
  });

  describe('require scope', () => {
    test('passes when a scope is provided with an allowlist', async () => {
      await validatePrTitle('fix(core): Bar', { scopes: ['core'], requireScope: true });
    });

    test('throws when a scope is missing with an allowlist', async () => {
      await assertRejects(
        'fix: Bar',
        { scopes: ['foo', 'bar'], requireScope: true },
        'No scope found in pull request title "fix: Bar". Scope must match one of: foo, bar.',
      );
    });

    test('passes when a scope is provided without an allowlist', async () => {
      await validatePrTitle('fix(core): Bar', { requireScope: true });
    });

    test('throws without mentioning scopes when a scope is missing and there is no allowlist', async () => {
      await assertRejects('fix: Bar', { requireScope: true }, /^No scope found in pull request title "fix: Bar".$/);
    });
  });

  describe('disallow scopes', () => {
    const passing = [
      ['fix(core): Bar', ['release']],
      ['fix(core): Bar', ['[A-Z]+']],
      ['fix(core,e2e,bar): Bar', ['release']],
      ['fix(core,e2e,bar): Bar', ['[A-Z]+']],
      ['fix(core): Bar', ['release', 'test', '[A-Z]+']],
      ['fix(core,e2e,bar): Bar', ['release', 'test', '[A-Z]+']],
    ];

    for (const [title, disallowScopes] of passing) {
      test(`passes '${title}' with disallowScopes ${disallowScopes.join(', ')}`, async () => {
        await validatePrTitle(title, { disallowScopes });
      });
    }

    const failing = [
      ['fix(release): Bar', ['release'], 'Disallowed scope was found: release'],
      ['fix(RELEASE): Bar', ['[A-Z]+'], 'Disallowed scope was found: RELEASE'],
      ['fix(release): Bar', ['release', 'test'], 'Disallowed scope was found: release'],
      ['fix(RELEASE): Bar', ['[A-Z]+', '^[A-Z].+$'], 'Disallowed scope was found: RELEASE'],
      ['fix(release,e2e): Bar', ['release'], 'Disallowed scope was found: release'],
      ['fix(RELEASE,e2e): Bar', ['[A-Z]+'], 'Disallowed scope was found: RELEASE'],
      ['fix(release,e2e): Bar', ['release', 'test'], 'Disallowed scope was found: release'],
      ['fix(RELEASE,e2e): Bar', ['[A-Z]+', 'test'], 'Disallowed scope was found: RELEASE'],
      ['fix(release,test,CORE): Bar', ['release', 'test', '[A-Z]+'], 'Disallowed scopes were found: release, test, CORE'],
    ];

    for (const [title, disallowScopes, message] of failing) {
      test(`rejects '${title}' with disallowScopes ${disallowScopes.join(', ')}`, async () => {
        await assertRejects(title, { disallowScopes }, message);
      });
    }
  });
});

describe('custom types', () => {
  test('allows PR titles with a supported type', async () => {
    for (const title of ['foo: Foobar', 'bar: Foobar', 'baz: Foobar']) {
      await validatePrTitle(title, { types: ['foo', 'bar', 'baz'] });
    }
  });

  test('throws for PR titles with an unknown type', async () => {
    await assertRejects('fix: Foobar', { types: ['foo', 'bar'] }, 'Unknown release type "fix" found in pull request title "fix: Foobar".');
  });
});

describe('description validation', () => {
  const subjectPattern = '^(?![A-Z]).+$';

  test('does not validate the description by default', async () => {
    await validatePrTitle('fix: sK!"§4123');
  });

  test('can pass the validation when `subjectPatternError` is configured', async () => {
    await validatePrTitle('fix: foobar', { subjectPattern, subjectPatternError: 'cannot start with an uppercase character.' });
  });

  test('uses the `subjectPatternError` if available when the `subjectPattern` does not match', async () => {
    const subjectPatternError = 'The subject found in the pull request title cannot start with an uppercase character.';
    await assertRejects('fix: Foobar', { subjectPattern, subjectPatternError }, subjectPatternError);
  });

  test('interpolates variables into `subjectPatternError`', async () => {
    await assertRejects(
      'fix: Foobar',
      { subjectPattern, subjectPatternError: 'The subject "{subject}" found in the pull request title "{title}" cannot start with an uppercase character.' },
      'The subject "Foobar" found in the pull request title "fix: Foobar" cannot start with an uppercase character.',
    );
  });

  test('throws for invalid subjects', async () => {
    await assertRejects(
      'fix: Foobar',
      { subjectPattern },
      'The subject "Foobar" found in pull request title "fix: Foobar" doesn\'t match the configured pattern "^(?![A-Z]).+$".',
    );
  });

  test('throws for only partial matches', async () => {
    await assertRejects(
      'fix: Foobar',
      { subjectPattern: 'Foo' },
      'The subject "Foobar" found in pull request title "fix: Foobar" isn\'t an exact match for the configured pattern "Foo". Please provide a subject that matches the whole pattern exactly.',
    );
  });

  test('accepts valid subjects', async () => {
    await validatePrTitle('fix: foobar', { subjectPattern });
  });
});

describe('formatMessage', () => {
  test('handles a string without variables', () => {
    assert.equal(formatMessage('this is test'), 'this is test');
  });

  test('inserts dollar sequences literally', () => {
    assert.equal(formatMessage('Invalid subject: {subject}', { subject: "update $& and $' handling" }), "Invalid subject: update $& and $' handling");
  });

  test('replaces multiple variables and instances', () => {
    assert.equal(
      formatMessage('{title}: {subject}, {subject}', { subject: 'my subject', title: 'my title' }),
      'my title: my subject, my subject',
    );
  });
});

describe('rudderlabs titles', () => {
  test('accepts breaking-change markers with a scope', async () => {
    await validatePrTitle('feat(api)!: change the public API');
  });

  test('rejects a breaking-change marker without the colon', async () => {
    await assertRejects('feat(api)! change the public API', undefined, 'No release type found');
  });

  test('accepts the release-please title', async () => {
    await validatePrTitle('chore(master): release 0.26.0');
  });
});

describe('patterns with alternation match as a whole', () => {
  test('rejects a type that only starts with an alternative', async () => {
    await assertRejects('feature: x', { types: ['feat|fix'] }, 'Unknown release type "feature"');
    await validatePrTitle('fix: x', { types: ['feat|fix'] });
  });

  test('rejects a scope that only starts with an alternative', async () => {
    await assertRejects('fix(core-extra): x', { scopes: ['core|web'] }, 'Unknown scope "core-extra"');
  });

  test('allows a scope that only starts with a disallowed alternative', async () => {
    await validatePrTitle('fix(release-tools): x', { disallowScopes: ['release|admin'] });
  });
});

describe('GitHub revert titles', () => {
  test('accepts the title the Revert button writes when the quoted title is valid', async () => {
    await validatePrTitle('Revert "feat(api): add retries"');
  });

  test('accepts a revert of a revert', async () => {
    await validatePrTitle('Revert "Revert "fix: correct title validation""');
  });

  test('applies the configured rules to the quoted title', async () => {
    await assertRejects('Revert "feat(router): add retries"', { scopes: ['core'] }, 'Unknown scope "router"');
  });

  test('rejects a revert of a non-conventional title', async () => {
    await assertRejects('Revert "Add retries"', undefined, 'No release type found in pull request title "Add retries"');
  });

  test('accepts a revert commit message with a body', async () => {
    await validatePrTitle('Revert "fix: correct title validation"\n\nThis reverts commit abc123.');
  });
});

describe('isBotPullRequest', () => {
  test('skips pull requests that GitHub reports as opened by a bot', () => {
    assert.equal(isBotPullRequest({ user: { login: 'dependabot[bot]', type: 'Bot' } }), true);
  });

  test('checks pull requests from people', () => {
    assert.equal(isBotPullRequest({ user: { login: 'octocat', type: 'User' } }), false);
  });

  test('checks pull requests that carry no author', () => {
    assert.equal(isBotPullRequest({}), false);
    assert.equal(isBotPullRequest(undefined), false);
  });
});

describe('commit messages', () => {
  const body = 'a'.repeat(40 * 1024);

  // A slow regex blocks the thread, so the parse runs in a worker the test can stop.
  function validateInWorker(message, limitMs) {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
      import(workerData.module).then(async ({ validatePrTitle }) => {
        const start = performance.now();
        await validatePrTitle(workerData.message, { setOutputs: false });
        parentPort.postMessage(performance.now() - start);
      });`,
      { eval: true, workerData: { message, module: new URL('./validate-pr-title.mjs', import.meta.url).href } },
    );
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error(`no result within ${limitMs} ms`));
      }, limitMs);
      worker.once('message', (elapsedMs) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(elapsedMs);
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  test('validates a commit with a 40 KB body in under a second', async () => {
    const elapsedMs = await validateInWorker(`fix: done\n\n${body}\n\nRefs #1`, 10_000);
    assert.ok(elapsedMs < 1000, `took ${Math.round(elapsedMs)} ms`);
  });

  test('rejects a 40 KB header in under a second', async () => {
    await assert.rejects(validateInWorker(`fix: ${body}`, 10_000), /longer than 1000 characters/);
  });

  test('validates only the header line', async () => {
    await validatePrTitle('\nfix: done\r\nnot a conventional line');
    await assertRejects('wip\n\nfix: done', undefined, 'No release type found in pull request title "wip".');
  });

  test('skips blank and whitespace-only lines before the header', async () => {
    await validatePrTitle('   \nfix: done');
    await validatePrTitle('\t\nfix: done');
  });

  test('reports a title that is only GPG output as a title with no type', async () => {
    await assertRejects('gpg: rotate key', undefined, 'No release type found in pull request title "gpg: rotate key".');
  });

  test('reports a blank message as a title with no type', async () => {
    await assertRejects('   ', undefined, 'No release type found in pull request title "".');
  });

  test('reports a broken headerPattern instead of a missing type', async () => {
    await assert.rejects(validatePrTitle('fix: done', { headerPattern: '[' }), SyntaxError);
  });

  test('counts the length limit in code points', async () => {
    await validatePrTitle(`fix: ${'\u{1F600}'.repeat(498)}`);
  });

  test('marks an over-long header with an error code', async () => {
    await assert.rejects(validatePrTitle(`fix: ${'a'.repeat(MAX_HEADER_LENGTH)}`), { code: HEADER_TOO_LONG });
  });

  test('skips GPG output before the header, as the parser does', async () => {
    await validatePrTitle('gpg: Signature made today\nfix: done');
  });

  test('accepts a header at the length limit', async () => {
    await validatePrTitle(`fix: ${'a'.repeat(MAX_HEADER_LENGTH - 5)}`);
  });

  test('rejects a longer header', async () => {
    await assertRejects(`fix: ${'a'.repeat(MAX_HEADER_LENGTH - 4)}`, undefined, `The title is longer than ${MAX_HEADER_LENGTH} characters.`);
  });
});

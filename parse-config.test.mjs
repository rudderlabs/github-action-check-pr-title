import assert from 'node:assert/strict';
import test from 'node:test';

import { parseConfig, parseEnum } from './parse-config.mjs';

test('parses newline-delimited lists, trimming whitespace', () => {
  assert.deepEqual(parseEnum('one   \ntwo   \nthree  \r\nfour'), ['one', 'two', 'three', 'four']);
});

test('parses newline-delimited lists, including regex, trimming whitespace', () => {
  assert.deepEqual(parseEnum('one   \ntwo   \n^[A-Z]+\\n$  \r\nfour'), ['one', 'two', '^[A-Z]+\\n$', 'four']);
});

test('reads the amannn inputs from the runner environment', () => {
  const config = parseConfig({
    INPUT_TYPES: 'fix\nfeat\n',
    INPUT_SCOPES: 'core\n',
    INPUT_REQUIRESCOPE: 'false',
    INPUT_DISALLOWSCOPES: 'release',
    INPUT_SUBJECTPATTERN: '^(?![A-Z]).+$',
    INPUT_SUBJECTPATTERNERROR: 'bad {subject}',
    INPUT_HEADERPATTERN: '^(\\w*): (.*)$',
    INPUT_HEADERPATTERNCORRESPONDENCE: 'type, subject',
    INPUT_WIP: 'true',
    INPUT_VALIDATESINGLECOMMIT: 'true',
    INPUT_VALIDATESINGLECOMMITMATCHESPRTITLE: 'false',
    INPUT_GITHUBBASEURL: 'https://ghe.example.com/api/v3',
    INPUT_IGNORELABELS: 'bot\ndependencies',
    INPUT_GITHUBTOKEN: 'token',
  });

  assert.deepEqual(config, {
    types: ['fix', 'feat'],
    scopes: ['core'],
    requireScope: false,
    disallowScopes: ['release'],
    subjectPattern: '^(?![A-Z]).+$',
    subjectPatternError: 'bad {subject}',
    headerPattern: '^(\\w*): (.*)$',
    headerPatternCorrespondence: ['type', 'subject'],
    wip: true,
    validateSingleCommit: true,
    validateSingleCommitMatchesPrTitle: false,
    githubBaseUrl: 'https://ghe.example.com/api/v3',
    ignoreLabels: ['bot', 'dependencies'],
    githubToken: 'token',
  });
});

test('leaves unset inputs undefined', () => {
  assert.ok(Object.values(parseConfig({ INPUT_TYPES: '' })).every((value) => value === undefined));
});

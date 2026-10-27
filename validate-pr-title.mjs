// Ported from amannn/action-semantic-pull-request v6.1.1 (MIT, Copyright (c) 2020 Contributors)
// so this action is a drop-in replacement with the same rules and messages.
import * as core from '@actions/core';
import conventionalCommitsConfig from 'conventional-changelog-conventionalcommits';
import conventionalCommitTypes from 'conventional-commit-types' with { type: 'json' };
import { CommitParser } from 'conventional-commits-parser';

const defaultTypes = Object.keys(conventionalCommitTypes.types);

// The group keeps `feat|fix` from matching `feature`; amannn anchors without it.
function matchesWhole(pattern, value) {
  return new RegExp(`^(?:${pattern})$`).test(value);
}

export function formatMessage(message, values) {
  let formatted = message;
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      // A callback keeps `$&` and similar sequences in the value literal.
      formatted = formatted.replace(new RegExp(`{${key}}`, 'g'), () => value);
    }
  }
  return formatted;
}

// GitHub caps a PR title at 256 characters. A commit header has no cap.
export const MAX_HEADER_LENGTH = 1000;
export const HEADER_TOO_LONG = 'HEADER_TOO_LONG';

// The parser takes the first non-blank line that is not GPG output. When every
// line is GPG output, the first one stays, so the error message can name it.
export function headerOf(message) {
  const lines = message.split(/\r?\n/).filter((line) => line.trim());
  return lines.find((line) => !/^\s*gpg:/.test(line)) ?? lines[0] ?? '';
}

// The limit counts code points. Two UTF-16 units per code point is the most, so
// a longer string needs no count.
function isTooLong(header) {
  if (header.length <= MAX_HEADER_LENGTH) return false;
  return header.length > 2 * MAX_HEADER_LENGTH || [...header].length > MAX_HEADER_LENGTH;
}

export async function validatePrTitle(message, options = {}) {
  // The checks read only the header. Parse time grows faster than linear with
  // input length, so the parser never sees the body or an unbounded header.
  const prTitle = headerOf(message);
  const { scopes, requireScope, disallowScopes, subjectPattern, subjectPatternError, headerPattern, headerPatternCorrespondence, setOutputs = true } =
    options;
  const types = options.types || defaultTypes;
  const setOutput = setOutputs ? core.setOutput : () => {};

  if (isTooLong(prTitle)) {
    raiseError(`The title is longer than ${MAX_HEADER_LENGTH} characters.`, HEADER_TOO_LONG);
  }

  // GitHub's Revert button titles the pull request `Revert "<original title>"` (amannn#278).
  const revert = /^Revert "(.+)"(?:\n|$)/.exec(prTitle);
  if (revert) {
    return validatePrTitle(revert[1], options);
  }

  const { parser: parserOpts } = await conventionalCommitsConfig();
  // Nothing reads issue references, and their regex is the slowest part of a parse.
  parserOpts.issuePrefixes = null;
  if (headerPattern) {
    parserOpts.headerPattern = headerPattern;
    // The parser tries the preset's breaking pattern first, which would bypass the custom one.
    delete parserOpts.breakingHeaderPattern;
  }
  if (headerPatternCorrespondence) {
    parserOpts.headerCorrespondence = headerPatternCorrespondence;
  }
  // The parser throws on a blank message. The checks below report it as a title with no type.
  const result = prTitle.trim()
    ? new CommitParser(parserOpts).parse(prTitle)
    : { type: null, scope: null, subject: null, notes: [] };

  setOutput('type', result.type);
  setOutput('scope', result.scope);
  setOutput('subject', result.subject);
  // The parser records `!` as a BREAKING CHANGE note (amannn#273).
  setOutput('breaking', result.notes.some((note) => note.title === 'BREAKING CHANGE'));

  function printAvailableTypes() {
    return `Available types:\n${types
      .map((type) => {
        let bullet = ` - ${type}`;
        if (types === defaultTypes) {
          bullet += `: ${conventionalCommitTypes.types[type].description}`;
        }
        return bullet;
      })
      .join('\n')}`;
  }

  function isUnknownScope(s) {
    return scopes && !scopes.some((scope) => matchesWhole(scope, s));
  }

  function isDisallowedScope(s) {
    return disallowScopes && disallowScopes.some((scope) => matchesWhole(scope, s));
  }

  if (!result.type) {
    raiseError(
      `No release type found in pull request title "${prTitle}". Add a prefix to indicate what kind of release this pull request corresponds to. For reference, see https://www.conventionalcommits.org/\n\n${printAvailableTypes()}`,
    );
  }

  if (!result.subject) {
    raiseError(`No subject found in pull request title "${prTitle}".`);
  }

  if (!types.some((type) => matchesWhole(type, result.type))) {
    raiseError(`Unknown release type "${result.type}" found in pull request title "${prTitle}".\n\n${printAvailableTypes()}`);
  }

  if (requireScope && !result.scope) {
    let message = `No scope found in pull request title "${prTitle}".`;
    if (scopes) {
      message += ` Scope must match one of: ${scopes.join(', ')}.`;
    }
    raiseError(message);
  }

  const givenScopes = result.scope ? result.scope.split(',').map((scope) => scope.trim()) : undefined;

  const unknownScopes = givenScopes ? givenScopes.filter(isUnknownScope) : [];
  if (scopes && unknownScopes.length > 0) {
    raiseError(
      `Unknown ${unknownScopes.length > 1 ? 'scopes' : 'scope'} "${unknownScopes.join(',')}" found in pull request title "${prTitle}". Scope must match one of: ${scopes.join(', ')}.`,
    );
  }

  const disallowedScopes = givenScopes ? givenScopes.filter(isDisallowedScope) : [];
  if (disallowScopes && disallowedScopes.length > 0) {
    raiseError(`Disallowed ${disallowedScopes.length === 1 ? 'scope was' : 'scopes were'} found: ${disallowedScopes.join(', ')}`);
  }

  function throwSubjectPatternError(message) {
    if (subjectPatternError) {
      message = formatMessage(subjectPatternError, { subject: result.subject, title: prTitle });
    }
    raiseError(message);
  }

  if (subjectPattern) {
    const match = result.subject.match(new RegExp(subjectPattern));

    if (!match) {
      throwSubjectPatternError(
        `The subject "${result.subject}" found in pull request title "${prTitle}" doesn't match the configured pattern "${subjectPattern}".`,
      );
    }

    const matchedPart = match[0];
    if (matchedPart.length !== result.subject.length) {
      throwSubjectPatternError(
        `The subject "${result.subject}" found in pull request title "${prTitle}" isn't an exact match for the configured pattern "${subjectPattern}". Please provide a subject that matches the whole pattern exactly.`,
      );
    }
  }

  function raiseError(message, code) {
    setOutput('error_message', message);
    throw Object.assign(new Error(message), code && { code });
  }
}

// Bots such as Dependabot write titles longer than 100 characters or with a
// capitalised subject, and the bot rewrites the title on every update.
// GitHub sets the author type. A pull request opened with an App token, or a
// bot pull request that a person retitles, also skips. The README explains
// why that is acceptable for a format check.
export function isBotPullRequest(pullRequest) {
  return pullRequest?.user?.type === 'Bot';
}

// Ported from amannn/action-semantic-pull-request v6.1.1 (MIT, Copyright (c) 2020 Contributors)
// so this action is a drop-in replacement with the same rules and messages.
import * as core from '@actions/core';
import conventionalCommitsConfig from 'conventional-changelog-conventionalcommits';
import conventionalCommitTypes from 'conventional-commit-types' with { type: 'json' };
import { CommitParser } from 'conventional-commits-parser';

const defaultTypes = Object.keys(conventionalCommitTypes.types);

export function formatMessage(message, values) {
  let formatted = message;
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      formatted = formatted.replace(new RegExp(`{${key}}`, 'g'), value);
    }
  }
  return formatted;
}

export async function validatePrTitle(prTitle, options = {}) {
  // GitHub's Revert button titles the pull request `Revert "<original title>"` (amannn#278).
  const revert = /^Revert "(.+)"(?:\n|$)/.exec(prTitle);
  if (revert) {
    return validatePrTitle(revert[1], options);
  }

  const { scopes, requireScope, disallowScopes, subjectPattern, subjectPatternError, headerPattern, headerPatternCorrespondence } = options;
  const types = options.types || defaultTypes;

  const { parser: parserOpts } = await conventionalCommitsConfig();
  if (headerPattern) {
    parserOpts.headerPattern = headerPattern;
  }
  if (headerPatternCorrespondence) {
    parserOpts.headerCorrespondence = headerPatternCorrespondence;
  }
  const result = new CommitParser(parserOpts).parse(prTitle);

  core.setOutput('type', result.type);
  core.setOutput('scope', result.scope);
  core.setOutput('subject', result.subject);
  // The parser records `!` as a BREAKING CHANGE note (amannn#273).
  core.setOutput('breaking', result.notes.some((note) => note.title === 'BREAKING CHANGE'));

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
    return scopes && !scopes.some((scope) => new RegExp(`^${scope}$`).test(s));
  }

  function isDisallowedScope(s) {
    return disallowScopes && disallowScopes.some((scope) => new RegExp(`^${scope}$`).test(s));
  }

  if (!result.type) {
    raiseError(
      `No release type found in pull request title "${prTitle}". Add a prefix to indicate what kind of release this pull request corresponds to. For reference, see https://www.conventionalcommits.org/\n\n${printAvailableTypes()}`,
    );
  }

  if (!result.subject) {
    raiseError(`No subject found in pull request title "${prTitle}".`);
  }

  if (!types.some((type) => new RegExp(`^${type}$`).test(result.type))) {
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

  function raiseError(message) {
    core.setOutput('error_message', message);
    throw new Error(message);
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

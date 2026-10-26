import configConventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import conventionalCommits from 'conventional-changelog-conventionalcommits';

const { parserOpts } = await conventionalCommits();

export async function lintTitle(title) {
  return lint(title, configConventional.rules, { parserOpts });
}

// Bots such as Dependabot write titles longer than 100 characters or with a
// capitalised subject, and the bot rewrites the title on every update.
// GitHub sets the author type. A pull request opened with an App token, or a
// bot pull request that a person retitles, also skips. The README explains
// why that is acceptable for a format check.
export function isBotPullRequest(pullRequest) {
  return pullRequest?.user?.type === 'Bot';
}

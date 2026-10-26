import configConventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import conventionalCommits from 'conventional-changelog-conventionalcommits';

const { parserOpts } = await conventionalCommits();

export async function lintTitle(title) {
  return lint(title, configConventional.rules, { parserOpts });
}

// Bots such as Dependabot write titles longer than 100 characters or with a
// capitalised subject, and the bot rewrites the title on every update. The
// author type comes from GitHub, so a person cannot set it to skip the check.
// A person who retitles a bot pull request also skips the check.
export function isBotPullRequest(pullRequest) {
  return pullRequest?.user?.type === 'Bot';
}

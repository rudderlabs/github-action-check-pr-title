import configConventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import conventionalCommits from 'conventional-changelog-conventionalcommits';

const { parserOpts } = await conventionalCommits();

export async function lintTitle(title) {
  return lint(title, configConventional.rules, { parserOpts });
}

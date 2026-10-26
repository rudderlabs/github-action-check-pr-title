import { context } from '@actions/github';
import { isBotPullRequest, lintTitle } from './lint-title.mjs';

async function run() {
  const pullRequest = context.payload.pull_request;

  if (!pullRequest) {
    // A merge queue run carries no pull request title. The pull_request run
    // already checked it, and a required check must pass for the queue to merge.
    if (context.eventName === 'merge_group') {
      console.log('Skipping: a merge_group event has no pull request title to check.');
      return;
    }

    console.log(`Error: the '${context.eventName}' event has no pull request. Run this action on pull_request events.`);
    process.exit(1);
  }

  const title = pullRequest.title;
  console.log(`Checking PR title: '${title}'`);

  if (isBotPullRequest(pullRequest)) {
    console.log(`Skipping: the author ${pullRequest.user.login} is a bot.`);
    return;
  }

  const report = await lintTitle(title);

  if (!report.valid) {
    console.log('Errors');
    console.log(report.errors);

    console.log('Warnings');
    console.log(report.warnings);

    process.exit(1);
  }
}

run();

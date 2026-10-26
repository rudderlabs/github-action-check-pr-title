import { context } from '@actions/github';
import { isBotPullRequest, lintTitle } from './lint-title.mjs';

async function run() {
  const pullRequest = context.payload.pull_request;
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

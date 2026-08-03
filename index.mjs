import { context } from '@actions/github';
import { lintTitle } from './lint-title.mjs';

async function run() {
  const title = context.payload.pull_request.title;
  console.log(`Checking PR title: '${title}'`);

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

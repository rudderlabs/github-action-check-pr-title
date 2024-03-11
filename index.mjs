import { context } from '@actions/github';
import lint from '@commitlint/lint';
import configConventional from '@commitlint/config-conventional';

async function run() {
  const title = context.payload.pull_request.title;
  console.log(`Checking PR title: '${title}'`);

  const report = await lint(title, configConventional.rules);

  if (!report.valid) {
    console.log('Errors');
    console.log(report.errors);

    console.log('Warnings');
    console.log(report.warnings);

    process.exit(1);
  }
}

run();

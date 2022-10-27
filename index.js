const github = require('@actions/github');
const lint = require('@commitlint/lint').default;
const config = require('@commitlint/config-conventional');

async function run() {
  const title = github.context.payload.pull_request.title;
  console.log(`Checking PR title: '${title}'`);

  const report = await lint(title, config.rules);

  if (!report.valid) {
    console.log('Errors')
    console.log(report.errors);
    console.log('Warnings')
    console.log(report.warnings);
    process.exit(1);
  }
}

run();

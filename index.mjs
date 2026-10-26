// The flow follows amannn/action-semantic-pull-request v6.1.1 (MIT). Additions: bot and merge_group
// skips, and a payload fallback so workflows that pass no GITHUB_TOKEN keep working.
import * as core from '@actions/core';
import * as github from '@actions/github';

import { parseConfig } from './parse-config.mjs';
import { HEADER_TOO_LONG, isBotPullRequest, MAX_HEADER_LENGTH, validatePrTitle } from './validate-pr-title.mjs';

async function run() {
  try {
    const {
      types,
      scopes,
      requireScope,
      disallowScopes,
      wip,
      subjectPattern,
      subjectPatternError,
      headerPattern,
      headerPatternCorrespondence,
      validateSingleCommit,
      validateSingleCommitMatchesPrTitle,
      githubBaseUrl,
      ignoreLabels,
      githubToken,
    } = parseConfig();
    const validationOptions = {
      types,
      scopes,
      requireScope,
      disallowScopes,
      subjectPattern,
      subjectPatternError,
      headerPattern,
      headerPatternCorrespondence,
    };

    // The env variable is amannn's contract; the input also works in reusable workflows (amannn#271).
    const token = process.env.GITHUB_TOKEN || githubToken;
    const client = token && github.getOctokit(token, { baseUrl: githubBaseUrl });

    function reportStatus(owner, repo, sha, state, description) {
      return client.request('POST /repos/{owner}/{repo}/statuses/{sha}', {
        owner,
        repo,
        sha,
        state,
        target_url: 'https://github.com/rudderlabs/github-action-check-pr-title',
        description,
        // amannn's context name, so branch protection rules that require it keep working.
        context: 'action-semantic-pull-request',
      });
    }

    const contextPullRequest = github.context.payload.pull_request;
    if (!contextPullRequest) {
      // A merge queue run carries no pull request title. The pull_request run
      // already checked it, and a required check must pass for the queue to merge.
      if (github.context.eventName === 'merge_group') {
        // A required wip status must also exist on the merge queue commit.
        if (wip && client) {
          const { owner, repo } = github.context.repo;
          await reportStatus(owner, repo, github.context.payload.merge_group.head_sha, 'success', 'The pull request run checked the title.');
        }
        core.info('Skipping: a merge_group event has no pull request title to check.');
        return;
      }

      throw new Error(`The '${github.context.eventName}' event has no pull request. Run this action on pull_request events.`);
    }

    if (!token && (wip || validateSingleCommit)) {
      throw new Error('`wip` and `validateSingleCommit` need the GITHUB_TOKEN environment variable or the githubToken input to call the GitHub API.');
    }

    const owner = contextPullRequest.base.user.login;
    const repo = contextPullRequest.base.repo.name;

    // The payload title is stale when a person retitles the pull request and
    // re-runs the job, so read the current one when there is a token.
    const pullRequest = client
      ? (await client.rest.pulls.get({ owner, repo, pull_number: contextPullRequest.number })).data
      : contextPullRequest;

    core.info(`Checking PR title: '${pullRequest.title}'`);

    // A skipped pull request still needs the required wip status, or it can never merge.
    const skip = async (message) => {
      if (wip) await reportStatus(owner, repo, pullRequest.head.sha, 'success', 'PR title validation was skipped.');
      core.info(message);
    };

    if (isBotPullRequest(pullRequest)) {
      return skip(`Skipping: the author ${pullRequest.user.login} is a bot.`);
    }

    if (ignoreLabels) {
      const labelName = pullRequest.labels.map((label) => label.name).find((name) => ignoreLabels.includes(name));
      if (labelName) {
        return skip(`Validation was skipped because the PR label "${labelName}" was found.`);
      }
    }

    // Pull requests that start with "[WIP] " are excluded from the check.
    const isWip = wip && /^\[WIP\]\s/.test(pullRequest.title);

    let validationError;
    if (!isWip) {
      try {
        await validatePrTitle(pullRequest.title, validationOptions);

        if (validateSingleCommit) {
          const commits = [];
          let nonMergeCommits = [];

          for await (const response of client.paginate.iterator(client.rest.pulls.listCommits, {
            owner,
            repo,
            pull_number: contextPullRequest.number,
          })) {
            commits.push(...response.data);

            // GitHub ignores merge commits when it picks the squash commit message.
            nonMergeCommits = commits.filter((commit) => commit.parents.length < 2);

            // Two non-merge commits mean GitHub uses the PR title.
            if (nonMergeCommits.length >= 2) break;
          }

          // With one non-merge commit, GitHub squashes with that commit's message instead of the PR title.
          if (nonMergeCommits.length === 1) {
            try {
              // The outputs describe the PR title, so the commit check must not overwrite them.
              await validatePrTitle(nonMergeCommits[0].commit.message, { ...validationOptions, setOutputs: false });
            } catch (error) {
              if (error.code === HEADER_TOO_LONG) {
                throw new Error(
                  `Pull request has only one commit and its commit header is longer than ${MAX_HEADER_LENGTH} characters. Shorten the commit header, or add another commit.`,
                );
              }
              throw new Error(
                `Pull request has only one commit and it's not semantic; this may lead to a non-semantic commit in the base branch (see https://github.com/community/community/discussions/16271 ). Amend the commit message to match the pull request title, or add another commit.`,
              );
            }

            if (validateSingleCommitMatchesPrTitle) {
              const commitTitle = nonMergeCommits[0].commit.message.split(/\r?\n/)[0];
              if (commitTitle !== pullRequest.title) {
                throw new Error(
                  `The pull request has only one (non-merge) commit and in this case Github will use it as the default commit message when merging. The pull request title doesn't match the commit though ("${pullRequest.title}" vs. "${commitTitle}"). Please update the pull request title accordingly to avoid surprises.`,
                );
              }
            }
          }
        }
      } catch (error) {
        validationError = error;
      }
    }

    if (wip) {
      // A pending status keeps the check open, for repositories without draft pull requests.
      await reportStatus(
        owner,
        repo,
        pullRequest.head.sha,
        isWip || validationError != null ? 'pending' : 'success',
        isWip ? 'This PR is marked with "[WIP]".' : validationError ? 'PR title validation failed' : 'Ready for review & merge.',
      );
    }

    if (!isWip && validationError) {
      core.setOutput('error_message', validationError.message);
      throw validationError;
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

await run();

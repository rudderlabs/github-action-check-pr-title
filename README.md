# PR title conventional commit syntax check action

Checks the PR title against the [Conventional Commits](https://www.conventionalcommits.org/) spec.

The action is a drop-in replacement for [amannn/action-semantic-pull-request](https://github.com/amannn/action-semantic-pull-request) v6.
It takes the same inputs, sets the same outputs, applies the same rules and reports the same messages.
It adds a `githubToken` input, a `breaking` output and support for GitHub's revert titles.
To switch, change only the `uses:` line.

## Rules

With no inputs, the title must be `type(scope)!: subject`, where the scope and `!` are optional.
The type must be one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`.
The action does not check case. Use `subjectPattern` for case rules.
A header longer than 1000 characters fails. GitHub caps a PR title at 256 characters, so the limit affects only the commit that `validateSingleCommit` checks.

A title written by GitHub's Revert button, `Revert "<title>"`, passes when the quoted title passes.
amannn fails these titles.

### Upgrading from v1

v1 ran commitlint. v2 drops these commitlint rules, so titles that v1 failed can pass:

- `header-max-length`: the 100-character header limit.
- `subject-case`: the subject case rule. To keep it, set `subjectPattern: ^(?![A-Z]).+$`.
- `subject-full-stop`: the ban on a trailing period.
- `header-trim`: the ban on trailing whitespace in the title. A leading space still fails, because the type must start the title.

## Skips

The action skips a pull request when GitHub reports the author type as `Bot`.
These authors skip the check:

- Dependabot, the GitHub Actions bot, and other GitHub Apps.
- Any person or agent that opens the pull request with a GitHub App installation token, such as Copilot or a coding agent. A GitHub App user access token acts as the person, so that pull request is checked.
- A person who retitles a pull request that a bot opened.

A label or an input cannot turn the skip on, because GitHub sets the author type.
The check enforces a title format. It is not a security control, so these gaps are acceptable.
To skip by label instead, use `ignoreLabels`.

On a `merge_group` event the action always passes with a log line, because that event carries no pull request title.
The merge queue then relies on the `pull_request` run. Run the check on the `edited` type too, so a renamed title is checked again:

```yaml
on:
  pull_request:
    types: [opened, edited, reopened, synchronize]
  merge_group:
```

## Token

Pass `GITHUB_TOKEN` in `env`, or the `githubToken` input, to read the current title from the API.
The environment variable wins when both are set.
Without it the action reads the title from the event payload, which is stale when someone retitles the pull request and re-runs the job.
`wip` and `validateSingleCommit` call the API, so they need the token.

| Option | Permission |
| --- | --- |
| any | `pull-requests: read` |
| `wip` | `statuses: write` |

## Inputs

All inputs are optional. Lists are newline-delimited, and list entries are regex patterns wrapped in `^ $`.

| Input | Description |
| --- | --- |
| `types` | Allowed types. Defaults to the list in [Rules](#rules). |
| `scopes` | Allowed scopes. Any scope is allowed by default. |
| `requireScope` | `true` to require a scope. |
| `disallowScopes` | Scopes that are not allowed. |
| `subjectPattern` | Regex the whole subject must match, e.g. `^(?![A-Z]).+$` rejects an uppercase first letter. |
| `subjectPatternError` | Message when `subjectPattern` fails. `{subject}` and `{title}` are replaced. |
| `headerPattern` | Custom header regex. See [headerPattern](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-commits-parser#headerpattern). |
| `headerPatternCorrespondence` | Comma-separated names of the `headerPattern` groups, e.g. `type, scope, subject`. |
| `wip` | `true` to skip titles that start with `[WIP] ` and report a pending `action-semantic-pull-request` status. Bot, `ignoreLabels` and `merge_group` skips report it as successful, so a required status never blocks them. |
| `validateSingleCommit` | `true` to also validate the commit message when the pull request has one non-merge commit, because GitHub squashes with that message. |
| `validateSingleCommitMatchesPrTitle` | With `validateSingleCommit`, `true` to require that commit's title to equal the PR title. |
| `ignoreLabels` | Labels that skip the check. Add the `labeled` and `unlabeled` triggers to re-run on label changes. |
| `githubBaseUrl` | API URL. Defaults to `github.api_url`. |
| `githubToken` | API token, as an alternative to the `GITHUB_TOKEN` environment variable. Not in amannn. |

## Outputs

| Output | Description |
| --- | --- |
| `type`, `scope`, `subject` | Parsed from the title. Not set when the check is skipped. |
| `breaking` | `true` when the title marks a breaking change with `!`. Always `false` with a custom `headerPattern`. Not in amannn. |
| `error_message` | Set when the title fails. |

## Example usage

```yaml
permissions:
  pull-requests: read

steps:
  - name: Check PR title
    uses: rudderlabs/github-action-check-pr-title@<sha> # v2.0.2
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    with:
      types: |
        fix
        feat
        chore
      subjectPattern: ^(?![A-Z]).+$
      ignoreLabels: |
        bot
        dependencies
```

## Development

The action runs `dist/index.mjs`. After changing the source, run `npm run build` and commit `dist/`. CI fails when `dist/` is stale.

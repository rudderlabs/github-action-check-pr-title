# PR title conventional commit syntax check action

Check PR title against conventional commit standards and display any rule violations.
Using the default rule preset of [@commitlint/config-conventional](https://www.npmjs.com/package/@commitlint/config-conventional)

The action skips a pull request when GitHub reports the author type as `Bot`.
These authors skip the check:

- Dependabot, the GitHub Actions bot, and other GitHub Apps.
- Any person or agent that opens the pull request with a GitHub App token, such as Copilot or a coding agent.
- A person who retitles a pull request that a bot opened.

A label or an input cannot turn the skip on, because GitHub sets the author type.
The check enforces a title format. It is not a security control, so these gaps are acceptable.

## Inputs

No inputs.

## Outputs

No outputs.

## Example usage

```yaml
- name: Check PR title
  uses: rudderlabs/github-action-check-pr-title@v1.0.7
```

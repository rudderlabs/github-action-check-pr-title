# PR title conventional commit syntax check action

Check PR title against conventional commit standards and display any rule violations.
Using the default rule preset of [@commitlint/config-conventional](https://www.npmjs.com/package/@commitlint/config-conventional)

The action skips pull requests whose author is a bot, such as Dependabot or a GitHub App.
GitHub sets the author type, so people cannot use it to skip the check.

## Inputs

No inputs.

## Outputs

No outputs.

## Example usage

```yaml
- name: Check PR title
  uses: rudderlabs/github-action-check-pr-title@v1.0.7
```

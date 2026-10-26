// The runner reads `::name::` at the start of a log line and `##[name]` anywhere
// in it as a workflow command. It trims Unicode whitespace before the `::`, so
// every `::` is broken, not only a leading one. A zero-width space keeps the
// text readable.
const ZERO_WIDTH_SPACE = '​';

export function escapeWorkflowCommands(text) {
  return String(text)
    .replace(/##\[/g, `#${ZERO_WIDTH_SPACE}#[`)
    .replace(/::/g, `:${ZERO_WIDTH_SPACE}:`);
}

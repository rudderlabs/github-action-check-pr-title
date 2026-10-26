// Reads amannn/action-semantic-pull-request's inputs under the same names, so workflows switch by changing `uses:` only.

export function parseEnum(input) {
  return input
    .split(/\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseBoolean(input) {
  return JSON.parse(input.trim());
}

function parseList(input) {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const inputs = {
  types: ['INPUT_TYPES', parseEnum],
  scopes: ['INPUT_SCOPES', parseEnum],
  requireScope: ['INPUT_REQUIRESCOPE', parseBoolean],
  disallowScopes: ['INPUT_DISALLOWSCOPES', parseEnum],
  subjectPattern: ['INPUT_SUBJECTPATTERN', String],
  subjectPatternError: ['INPUT_SUBJECTPATTERNERROR', String],
  headerPattern: ['INPUT_HEADERPATTERN', String],
  headerPatternCorrespondence: ['INPUT_HEADERPATTERNCORRESPONDENCE', parseList],
  wip: ['INPUT_WIP', parseBoolean],
  validateSingleCommit: ['INPUT_VALIDATESINGLECOMMIT', parseBoolean],
  validateSingleCommitMatchesPrTitle: ['INPUT_VALIDATESINGLECOMMITMATCHESPRTITLE', parseBoolean],
  githubBaseUrl: ['INPUT_GITHUBBASEURL', String],
  ignoreLabels: ['INPUT_IGNORELABELS', parseEnum],
  githubToken: ['INPUT_GITHUBTOKEN', String],
};

export function parseConfig(env = process.env) {
  return Object.fromEntries(Object.entries(inputs).map(([name, [variable, parse]]) => [name, env[variable] ? parse(env[variable]) : undefined]));
}

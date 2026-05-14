import * as core from '@actions/core';
import * as fs from 'fs';
import {
  handleWhiteSpaceInFilepaths,
  listChangedFilesWithoutOwnership,
  parseCodeownersFile,
  parseIgnoreFileContent,
} from './codeowners';

const INPUT_CHANGED_FILES = 'changedFiles';
const INPUT_DELETED_FILES = 'deletedFiles';

/**
 * Combined UTF-8 byte cap for `changedFiles` + `deletedFiles`. Inputs are passed through the runner
 * environment; exceeding typical ARG_MAX / env limits can make Docker or Node fail to start the action.
 */
export const MAX_COMBINED_INPUT_BYTES = 100_000;

export function shouldSkipForInputSize(
  changedRaw: string,
  deletedRaw: string,
): boolean {
  return (
    Buffer.byteLength(changedRaw, 'utf8') +
      Buffer.byteLength(deletedRaw, 'utf8') >
    MAX_COMBINED_INPUT_BYTES
  );
}

/** Human-readable failure body for annotations and the `errorMessage` output. */
export function buildFailureMessage(unowned: string[]): string {
  let message = '\nReview the ownership of the following files:\n';
  for (const file of unowned) {
    message += `    - ${file}\n`;
  }
  message +=
    '\nPlease update `.github/CODEOWNERS` for the paths above. See GitHub’s documentation on code owners:\n' +
    'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners\n' +
    'To skip paths without requiring an owner, use `.github/.codeownersignore` (see the action README):\n' +
    'https://github.com/garretpatten/codeowner-verifier#codeownersignore';
  return message;
}

/** Writes each path as its own log line inside a collapsible group (visible in the Actions UI). */
export function logUnownedFilesForJob(unowned: string[]): void {
  core.startGroup('Files without an effective CODEOWNERS owner');
  try {
    for (const file of unowned) {
      core.info(file);
    }
  } finally {
    core.endGroup();
  }
}

function readCodeownersText(): string {
  return fs.readFileSync('.github/CODEOWNERS', 'utf8');
}

function loadIgnorePatterns(): string[] {
  const githubPath = '.github/.codeownersignore';
  const legacyPath = '.codeownersignore';
  if (fs.existsSync(githubPath)) {
    return parseIgnoreFileContent(fs.readFileSync(githubPath, 'utf8'));
  }
  if (fs.existsSync(legacyPath)) {
    return parseIgnoreFileContent(fs.readFileSync(legacyPath, 'utf8'));
  }
  return [];
}

/**
 * Loads workflow inputs, evaluates `.github/CODEOWNERS` against changed paths, and fails the step
 * (via `core.setFailed`) when any changed file lacks an effective owner, setting the `errorMessage` output.
 */
export function verifyCodeowners(): void {
  const changedRaw = core.getInput(INPUT_CHANGED_FILES);
  const deletedRaw = core.getInput(INPUT_DELETED_FILES);

  if (shouldSkipForInputSize(changedRaw, deletedRaw)) {
    const skipReason =
      'CODEOWNERS verification was skipped: the changed/deleted file lists are too large to pass ' +
      'through GitHub Actions safely. Inputs are supplied as environment variables for the action process; ' +
      'very long values can exceed OS limits on argument/environment size (execve ARG_MAX) and cause ' +
      'the runner or Docker to fail before the action starts. Split the PR, reduce the diff, or verify ' +
      'CODEOWNERS locally.';
    core.warning(skipReason);
    core.setOutput('skipped', 'true');
    core.setOutput('skipReason', skipReason);
    return;
  }

  const changedFiles = handleWhiteSpaceInFilepaths(changedRaw);
  const deletedFiles = handleWhiteSpaceInFilepaths(deletedRaw);
  const ignorePatterns = loadIgnorePatterns();
  const rules = parseCodeownersFile(readCodeownersText());
  const unowned = listChangedFilesWithoutOwnership(
    changedFiles,
    rules,
    deletedFiles,
    ignorePatterns,
  );

  if (unowned.length === 0) {
    return;
  }

  const errorMessage = buildFailureMessage(unowned);
  logUnownedFilesForJob(unowned);
  // Set outputs before marking the step failed so the runner reliably records them for later steps.
  core.setOutput('unownedFiles', unowned.join('\n'));
  core.setOutput('errorMessage', errorMessage);
  core.setFailed(errorMessage);
}

if (require.main === module) {
  verifyCodeowners();
}

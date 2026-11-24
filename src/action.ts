import * as core from '@actions/core';
import * as fs from 'fs';
import {
  listChangedFilesWithoutOwnership,
  parseCodeownersFile,
  parseFileListInput,
  parseIgnoreFileContent,
} from './codeowners';
import type { CodeownerRule } from './codeowners';

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

/** Human-readable failure body for annotations and the `errorMessage` output. Unowned paths are wrapped in backticks so they render inert in markdown contexts. */
export function buildFailureMessage(unowned: string[]): string {
  let message = '\nReview the ownership of the following files:\n';
  for (const file of unowned) {
    message += `    - \`${file}\`\n`;
  }
  message +=
    '\nPlease update `.github/CODEOWNERS` for the paths above. See GitHub’s documentation on code owners:\n' +
    'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners\n' +
    'To skip paths without requiring an owner, use `.github/.codeownersignore` (see the action README):\n' +
    'https://github.com/garretpatten/codeowners-enforcer#codeownersignore';
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

/**
 * Candidate CODEOWNERS locations in GitHub's documented precedence order.
 */
const CODEOWNERS_PATHS = [
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
] as const;

/**
 * Loads workflow inputs, evaluates CODEOWNERS against changed paths, and fails the step
 * (via `core.setFailed`) when any changed file lacks an effective owner, setting the
 * `errorMessage` output. The `unownedFiles` / `errorMessage` outputs are always set
 * (empty string when the check passes) so downstream steps can test `== ''`.
 *
 * Unexpected errors (missing CODEOWNERS file, unreadable file, ...) are reported through
 * `core.setFailed` instead of surfacing as an unhandled crash.
 */
export function verifyCodeowners(): void {
  // Set the failure outputs before anything can fail so the runner reliably records them.
  core.setOutput('unownedFiles', '');
  core.setOutput('errorMessage', '');

  try {
    runVerification();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.setOutput('errorMessage', message);
    core.setFailed(message);
  }
}

function runVerification(): void {
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

  const changedFiles = parseFileListInput(changedRaw);
  const deletedFiles = parseFileListInput(deletedRaw);
  const ignorePatterns = loadIgnorePatterns();
  const rules = readCodeownersRules();
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
  core.setOutput('unownedFiles', unowned.join('\n'));
  core.setOutput('errorMessage', errorMessage);
  core.setFailed(errorMessage);
}

/**
 * Reads the CODEOWNERS file from the first candidate location that exists (GitHub
 * precedence: `.github/CODEOWNERS`, root `CODEOWNERS`, `docs/CODEOWNERS`); throws when
 * none exists or the file cannot be read.
 */
function readCodeownersRules(): CodeownerRule[] {
  const path = CODEOWNERS_PATHS.find((p) => fs.existsSync(p));
  if (!path) {
    throw new Error(
      'No CODEOWNERS file found (looked in .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS). ' +
        'Create one, or use `.github/.codeownersignore` to skip paths without requiring an owner.',
    );
  }
  return parseCodeownersFile(fs.readFileSync(path, 'utf8'));
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

if (require.main === module) {
  verifyCodeowners();
}

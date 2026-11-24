import * as core from '@actions/core';
import ignore from 'ignore';

/**
 * A single CODEOWNERS rule in file order. The last matching rule wins, matching
 * {@link https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners GitHub CODEOWNERS precedence}.
 */
export interface CodeownerRule {
  /** Gitignore-style path pattern as written in CODEOWNERS (may be root-anchored with a leading `/`). */
  readonly pattern: string;
  /** Owner handles or emails; empty when the line declares a path with no owners. */
  readonly owners: readonly string[];
}

const ignorerByPattern = new Map<string, ReturnType<typeof ignore>>();

/**
 * Clears cached `ignore` matchers. Intended for unit tests only.
 */
export function clearPatternMatcherCache(): void {
  ignorerByPattern.clear();
}

/**
 * Returns whether a repository-relative path matches a pattern using gitignore-style rules,
 * consistent with GitHub CODEOWNERS (implemented via the `ignore` package).
 */
export function patternMatchesPath(filepath: string, pattern: string): boolean {
  let ig = ignorerByPattern.get(pattern);
  if (!ig) {
    ig = ignore().add(pattern);
    ignorerByPattern.set(pattern, ig);
  }
  return ig.ignores(filepath);
}

/**
 * Returns {@code true} if the last matching rule in {@code rules} assigns one or more owners
 * to {@code filepath}.
 */
export function fileHasOwner(
  filepath: string,
  rules: readonly CodeownerRule[],
): boolean {
  let last: CodeownerRule | undefined;
  for (const rule of rules) {
    if (patternMatchesPath(filepath, rule.pattern)) {
      last = rule;
    }
  }
  return last !== undefined && last.owners.length > 0;
}

/**
 * Parses `.github/CODEOWNERS` (or equivalent) text into ordered rules.
 */
export function parseCodeownersFile(content: string): CodeownerRule[] {
  const rules: CodeownerRule[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const rule = parseCodeownersRuleLine(line);
    // GitHub ignores lines that begin with an owner (missing path pattern); this action
    // must not turn them into rules whose pattern is the owner handle.
    if (rule.pattern.startsWith('@')) {
      core.warning(
        `Ignoring invalid CODEOWNERS line (missing path pattern before owners): ${line}`,
      );
      continue;
    }
    if (rule.pattern.length > 0) {
      rules.push(rule);
    }
  }
  return rules;
}

/**
 * Parses one non-comment CODEOWNERS line into pattern and owners, honoring `\ `-escaped spaces in the pattern.
 */
export function parseCodeownersRuleLine(line: string): CodeownerRule {
  const parts = line.includes('\\ ')
    ? splitLineWithEscapedSpacesInPattern(line)
    : line.split(/\s+/).filter((t) => t.length > 0);

  if (parts.length === 0) {
    return { pattern: '', owners: [] };
  }

  const pattern = parts[0];
  const owners = collectOwners(parts.slice(1));
  return { pattern, owners };
}

/**
 * Collects owner tokens until an inline `#` comment starts a token.
 */
function collectOwners(tokens: readonly string[]): string[] {
  const owners: string[] = [];
  for (const t of tokens) {
    if (t.startsWith('#')) {
      break;
    }
    owners.push(t);
  }
  return owners;
}

/**
 * Splits a CODEOWNERS line when the file path portion contains escaped space sequences (`\ `).
 */
export function splitLineWithEscapedSpacesInPattern(
  codeownerLine: string,
): string[] {
  let filepath = '';
  let rest = codeownerLine;

  while (true) {
    if (rest.includes('\\ ')) {
      const idx = rest.indexOf('\\ ');
      filepath += rest.substring(0, idx) + ' ';
      rest = rest.substring(idx + 2);

      if (rest[0] === '@') {
        filepath = filepath.substring(0, filepath.length - 1);
        return [filepath, ...rest.split(/\s+/).filter((t) => t.length > 0)];
      }
    } else if (rest.includes(' ')) {
      const idx = rest.indexOf(' ');
      filepath += rest.substring(0, idx);
      rest = rest.substring(idx + 1);
      return [filepath, ...rest.split(/\s+/).filter((t) => t.length > 0)];
    } else {
      filepath += rest;
      return [filepath];
    }
  }
}

/**
 * Parses `.codeownersignore` text into gitignore-style patterns (one per non-empty, non-comment line).
 */
export function parseIgnoreFileContent(content: string): string[] {
  const patterns: string[] = [];
  for (const rawLine of content.split('\n')) {
    let entry = rawLine.replace(/\r$/, '');
    if (!entry || entry.startsWith('#')) {
      continue;
    }
    const hashIdx = entry.indexOf(' #');
    if (hashIdx !== -1) {
      entry = entry.substring(0, hashIdx);
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      patterns.push(trimmed);
    }
  }
  return patterns;
}

/**
 * Returns changed files that are not ignored, not treated as deleted-only paths, and have no effective owner
 * under the given ordered CODEOWNERS rules.
 */
export function listChangedFilesWithoutOwnership(
  changedFiles: readonly string[],
  rules: readonly CodeownerRule[],
  deletedFiles: readonly string[],
  ignorePatterns: readonly string[],
): string[] {
  const deletedSet = new Set(deletedFiles);
  return changedFiles.filter((filepath) => {
    if (ignorePatterns.some((p) => patternMatchesPath(filepath, p))) {
      return false;
    }
    if (deletedSet.has(filepath)) {
      return false;
    }
    return !fileHasOwner(filepath, rules);
  });
}

/**
 * Splits a workflow file-list input (`changedFiles` / `deletedFiles`) into individual
 * repository-relative paths.
 *
 * Canonical format: **newline-delimited** paths (one per line; a trailing `\r` from CRLF
 * input is tolerated). Newlines cannot occur in git paths, so this format is lossless,
 * including for paths that contain spaces.
 *
 * Legacy format (input contains no newline): **space-delimited** paths, split on
 * whitespace. Spaces inside paths cannot be represented in this format; when a
 * whitespace-separated token contains no `.` and is not the final token — exactly the
 * shape the historical extension-heuristic tokenizer merged into a single corrupt path —
 * a warning is emitted because the list may be misparsed.
 */
export function parseFileListInput(filesList: string): string[] {
  if (filesList.includes('\n')) {
    return filesList
      .split('\n')
      .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
      .filter((line) => line.length > 0);
  }
  return parseLegacySpaceDelimitedFileList(filesList);
}

/**
 * Legacy fallback for space-delimited file lists, which cannot represent paths
 * containing spaces. See {@link parseFileListInput} for the canonical format.
 */
function parseLegacySpaceDelimitedFileList(list: string): string[] {
  if (list === '') {
    return [];
  }
  const paths = list.split(/\s+/).filter((p) => p.length > 0);
  const hasAmbiguousToken =
    paths.length > 1 && paths.slice(0, -1).some((p) => !p.includes('.'));
  if (hasAmbiguousToken) {
    core.warning(
      'The file list looks space-delimited but contains extension-less paths; it may be ' +
        'misparsed. Prefer newline-delimited input for changedFiles/deletedFiles.',
    );
  }
  return paths;
}

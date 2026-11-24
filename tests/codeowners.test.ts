import * as core from '@actions/core';
import {
  MAX_COMBINED_INPUT_BYTES,
  shouldSkipForInputSize,
} from '../src/action';
import {
  clearPatternMatcherCache,
  fileHasOwner,
  listChangedFilesWithoutOwnership,
  parseCodeownersFile,
  parseCodeownersRuleLine,
  parseFileListInput,
  parseIgnoreFileContent,
  patternMatchesPath,
  splitLineWithEscapedSpacesInPattern,
} from '../src/codeowners';

describe('input size guard', () => {
  it('skips when combined UTF-8 byte length exceeds the cap', () => {
    const half = Math.ceil(MAX_COMBINED_INPUT_BYTES / 2) + 1;
    expect(shouldSkipForInputSize('a'.repeat(half), 'b'.repeat(half))).toBe(
      true,
    );
  });

  it('does not skip under the cap', () => {
    expect(shouldSkipForInputSize('a', 'b')).toBe(false);
  });
});

describe('codeowners (unit)', () => {
  afterEach(() => {
    clearPatternMatcherCache();
  });

  describe('patternMatchesPath', () => {
    it('treats a leading slash as repo-root-only (GitHub / gitignore semantics)', () => {
      expect(patternMatchesPath('docs/foo.md', '/docs/')).toBe(true);
      expect(patternMatchesPath('lib/docs/foo.md', '/docs/')).toBe(false);
    });

    it('matches directory patterns without a leading slash in any path segment', () => {
      expect(patternMatchesPath('build/apps/x.js', 'apps/')).toBe(true);
      expect(patternMatchesPath('docs/foo.md', 'docs/')).toBe(true);
    });

    it('matches extension globs like GitHub examples', () => {
      expect(patternMatchesPath('src/foo.js', '*.js')).toBe(true);
      expect(patternMatchesPath('foo.js', '*.js')).toBe(true);
    });
  });

  describe('fileHasOwner / parseCodeownersFile', () => {
    it('uses last matching rule; a later path with no owners clears ownership', () => {
      const rules = parseCodeownersFile(`* @global
special.txt
`);
      expect(fileHasOwner('other.js', rules)).toBe(true);
      expect(fileHasOwner('special.txt', rules)).toBe(false);
    });

    it('applies a more specific later owner over a global *', () => {
      const rules = parseCodeownersFile(`* @a
deep/file.txt @b
`);
      expect(fileHasOwner('deep/file.txt', rules)).toBe(true);
    });

    it('ignores full-line comments and supports inline owner comments', () => {
      const rules = parseCodeownersFile(`file1.js @team1 # inline
# file2.js @team2
file3.js @team3
`);
      expect(fileHasOwner('file1.js', rules)).toBe(true);
      expect(fileHasOwner('file2.js', rules)).toBe(false);
      expect(fileHasOwner('file3.js', rules)).toBe(true);
    });
  });

  describe('listChangedFilesWithoutOwnership', () => {
    it('excludes paths matched by ignore patterns using gitignore semantics (not substring)', () => {
      const rules = parseCodeownersFile('src/ @x\n');
      const changed = ['src/a.js', 'mysrc/b.js'];
      expect(
        listChangedFilesWithoutOwnership(changed, rules, [], ['src']),
      ).toEqual(['mysrc/b.js']);
    });

    it('treats deleted paths as not requiring ownership', () => {
      const rules = parseCodeownersFile('');
      expect(
        listChangedFilesWithoutOwnership(['gone.js'], rules, ['gone.js'], []),
      ).toEqual([]);
    });
  });

  describe('parseIgnoreFileContent', () => {
    it('strips inline comments after space-hash', () => {
      expect(parseIgnoreFileContent('README.md # docs\n')).toEqual([
        'README.md',
      ]);
    });
  });

  describe('parseCodeownersRuleLine / splitLineWithEscapedSpacesInPath', () => {
    it('parses a simple line', () => {
      expect(parseCodeownersRuleLine('foo.js @a @b')).toEqual({
        pattern: 'foo.js',
        owners: ['@a', '@b'],
      });
    });

    it('parses paths with escaped spaces before owners', () => {
      const line = 'path\\ with\\ spaces.txt @owner';
      expect(parseCodeownersRuleLine(line)).toEqual({
        pattern: 'path with spaces.txt',
        owners: ['@owner'],
      });
    });

    it('exposes escaped-space splitting for edge cases', () => {
      expect(splitLineWithEscapedSpacesInPattern('a\\ b @x')).toEqual([
        'a b',
        '@x',
      ]);
    });
  });

  describe('parseCodeownersFile (invalid lines)', () => {
    it('ignores owners-only lines (missing path pattern) with a warning naming the line', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      const rules = parseCodeownersFile('@global-owner\nsrc/ @team\n');
      expect(rules).toEqual([{ pattern: 'src/', owners: ['@team'] }]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('@global-owner'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('parseFileListInput', () => {
    it('returns an empty list for an empty input string', () => {
      expect(parseFileListInput('')).toEqual([]);
    });

    it('splits a simple space-delimited (legacy) list', () => {
      expect(parseFileListInput('a.js b.js')).toEqual(['a.js', 'b.js']);
    });

    it('handles dotfiles without extensions in legacy lists', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      expect(parseFileListInput('.github/CODEOWNERS .gitignore')).toEqual([
        '.github/CODEOWNERS',
        '.gitignore',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('collapses repeated whitespace without smuggling leading spaces into paths', () => {
      expect(parseFileListInput('a.js  b.js')).toEqual(['a.js', 'b.js']);
    });

    it('splits newline-delimited lists (canonical format)', () => {
      expect(parseFileListInput('a.ts\nb.ts\nc.ts')).toEqual([
        'a.ts',
        'b.ts',
        'c.ts',
      ]);
    });

    it('round-trips newline-delimited paths containing spaces', () => {
      expect(parseFileListInput('docs/read me.md\nsrc/a.ts')).toEqual([
        'docs/read me.md',
        'src/a.ts',
      ]);
    });

    it('tolerates CRLF line endings in newline-delimited lists', () => {
      expect(parseFileListInput('a.ts\r\nb.ts\r\n')).toEqual(['a.ts', 'b.ts']);
    });

    it('skips empty lines in newline-delimited lists', () => {
      expect(parseFileListInput('a.ts\n\nb.ts\n')).toEqual(['a.ts', 'b.ts']);
    });

    it('warns and splits separately when a legacy list has a non-final extension-less path (merged-path corruption class)', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      expect(parseFileListInput('Dockerfile src/index.ts')).toEqual([
        'Dockerfile',
        'src/index.ts',
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('newline-delimited'),
      );
      warnSpy.mockRestore();
    });

    it('warns once and returns every path for multiple extension-less tokens', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      expect(parseFileListInput('Makefile Dockerfile docs/readme.md')).toEqual([
        'Makefile',
        'Dockerfile',
        'docs/readme.md',
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('does not warn when the only extension-less path is the final token', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      expect(parseFileListInput('src/a.js Dockerfile')).toEqual([
        'src/a.js',
        'Dockerfile',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not warn for a single extension-less path', () => {
      const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});
      expect(parseFileListInput('Dockerfile')).toEqual(['Dockerfile']);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('never merges paths into one entry for extension-less names other than LICENSE', () => {
      expect(
        parseFileListInput('Makefile Dockerfile docs/readme.md').length,
      ).toBe(3);
      expect(parseFileListInput('LICENSE  foo.js')).toEqual([
        'LICENSE',
        'foo.js',
      ]);
    });
  });
});

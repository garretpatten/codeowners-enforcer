import {
  MAX_COMBINED_INPUT_BYTES,
  shouldSkipForInputSize,
} from '../src/action';
import {
  clearPatternMatcherCache,
  fileHasOwner,
  handleWhiteSpaceInFilepaths,
  listChangedFilesWithoutOwnership,
  parseCodeownersFile,
  parseCodeownersRuleLine,
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

  describe('handleWhiteSpaceInFilepaths', () => {
    it('splits a simple space-delimited list', () => {
      expect(handleWhiteSpaceInFilepaths('a.js b.js')).toEqual([
        'a.js',
        'b.js',
      ]);
    });

    it('handles dotfiles without extensions', () => {
      expect(
        handleWhiteSpaceInFilepaths('.github/CODEOWNERS .gitignore'),
      ).toEqual(['.github/CODEOWNERS', '.gitignore']);
    });
  });
});

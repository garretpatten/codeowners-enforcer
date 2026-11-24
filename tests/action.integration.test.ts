import { Mock, MockedFunction } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
  };
});

import * as core from '@actions/core';
import * as fs from 'fs';
import { verifyCodeowners } from '../src/action';
import { clearPatternMatcherCache } from '../src/codeowners';

const readFileSyncMock = fs.readFileSync as MockedFunction<
  typeof fs.readFileSync
>;
const existsSyncMock = fs.existsSync as MockedFunction<typeof fs.existsSync>;

describe('verifyCodeowners (integration)', () => {
  afterEach(() => {
    clearPatternMatcherCache();
  });

  beforeEach(() => {
    existsSyncMock.mockImplementation(
      (p) => String(p) === '.github/CODEOWNERS',
    );
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return 'file1.js file2.js file3.js file4.js file5.js';
      }
      if (name === 'deletedFiles') {
        return 'deleted1.js deleted2.js';
      }
      return '';
    });

    vi.spyOn(core, 'setFailed').mockImplementation(() => {});
    vi.spyOn(core, 'setOutput').mockImplementation(() => {});
    vi.spyOn(core, 'startGroup').mockImplementation(() => {});
    vi.spyOn(core, 'endGroup').mockImplementation(() => {});
    vi.spyOn(core, 'info').mockImplementation(() => {});
  });

  it('passes when there is a default owner in CODEOWNERS', () => {
    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return '* @defaultOwner\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', '');
    expect(core.setOutput).toHaveBeenCalledWith('errorMessage', '');
  });

  it('passes when every changed file matches an owning pattern', () => {
    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'file1.js @team1\nfile2.js @team2\nfile3.js @team3\nfile4.js @team4\nfile5.js @team5\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', '');
    expect(core.setOutput).toHaveBeenCalledWith('errorMessage', '');
  });

  it('passes with inline comments on owner lines', () => {
    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'file1.js @team1 # here is an inline comment\n# standalone\nfile2.js @team2 # another\nfile3.js @team3\nfile4.js @team4\nfile5.js @team5\n### weird ###\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', '');
    expect(core.setOutput).toHaveBeenCalledWith('errorMessage', '');
  });

  it('does not treat commented-out rules as active', () => {
    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'file1.js @team1\n# file2.js @team2\nfile3.js @team3\n### file4.js @team4 ###\nfile5.js @team5\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Review the ownership of the following files:'),
    );
    expect(core.startGroup).toHaveBeenCalledWith(
      'Files without an effective CODEOWNERS owner',
    );
    expect(core.info).toHaveBeenCalledWith('file2.js');
    expect(core.info).toHaveBeenCalledWith('file4.js');
    expect(core.endGroup).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith(
      'unownedFiles',
      'file2.js\nfile4.js',
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file1.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.stringContaining('file2.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file3.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.stringContaining('file4.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file5.js'),
    );
  });

  it('fails when a changed file has no effective owner', () => {
    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'file1.js @team1\nfile2.js @team2\nfile3.js @team3\nfile4.js @team4\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Review the ownership of the following files:'),
    );
    expect(core.info).toHaveBeenCalledWith('file5.js');
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', 'file5.js');
    const outputOrder = (core.setOutput as Mock).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(outputOrder.indexOf('unownedFiles')).toBeLessThan(
      outputOrder.indexOf('errorMessage'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file1.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file2.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file3.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.not.stringContaining('file4.js'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.stringContaining('file5.js'),
    );
  });

  it('matches patterns without a leading slash the same way GitHub does', () => {
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return 'packages/foo/docs/readme.md';
      }
      if (name === 'deletedFiles') {
        return '';
      }
      return '';
    });

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'docs/ @team\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reads legacy root .codeownersignore when the .github path does not exist', () => {
    existsSyncMock.mockImplementation(
      (p) =>
        String(p) === '.github/CODEOWNERS' || String(p) === '.codeownersignore',
    );

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return '* @team\n';
      }
      if (filepath === '.codeownersignore') {
        return 'file5.js\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('loads .github/.codeownersignore and omits ignored paths from the failure list', () => {
    existsSyncMock.mockImplementation(
      (p) =>
        String(p) === '.github/CODEOWNERS' ||
        String(p) === '.github/.codeownersignore',
    );

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return '* @team\n';
      }
      if (filepath === '.github/.codeownersignore') {
        return 'file5.js\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', '');
    expect(core.setOutput).toHaveBeenCalledWith('errorMessage', '');
  });

  it('fails when a global owner is overridden by a later unowned path', () => {
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return 'secret.cfg';
      }
      if (name === 'deletedFiles') {
        return '';
      }
      return '';
    });

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return '* @everyone\nsecret.cfg\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('unownedFiles', 'secret.cfg');
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.stringContaining('secret.cfg'),
    );
  });

  it('honors a root CODEOWNERS file when .github/CODEOWNERS does not exist', () => {
    existsSyncMock.mockImplementation((p) => String(p) === 'CODEOWNERS');

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === 'CODEOWNERS') {
        return '* @team\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('honors docs/CODEOWNERS when no other location exists', () => {
    existsSyncMock.mockImplementation((p) => String(p) === 'docs/CODEOWNERS');

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === 'docs/CODEOWNERS') {
        return '* @team\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('prefers .github/CODEOWNERS over root and docs locations (GitHub precedence)', () => {
    existsSyncMock.mockImplementation(
      (p) =>
        String(p) === '.github/CODEOWNERS' ||
        String(p) === 'CODEOWNERS' ||
        String(p) === 'docs/CODEOWNERS',
    );

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return 'file5.js @team5\n';
      }
      if (filepath === 'CODEOWNERS') {
        return '* @wrong\n';
      }
      if (filepath === 'docs/CODEOWNERS') {
        return '* @wrong\n';
      }
      return '';
    });

    verifyCodeowners();

    // Only .github/CODEOWNERS was read: file5.js owned, file1-4.js unowned.
    expect(core.setOutput).toHaveBeenCalledWith(
      'unownedFiles',
      'file1.js\nfile2.js\nfile3.js\nfile4.js',
    );
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('fails cleanly (no throw) when no CODEOWNERS file exists in any location', () => {
    existsSyncMock.mockReturnValue(false);

    verifyCodeowners();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('No CODEOWNERS file found'),
    );
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('docs/CODEOWNERS'),
    );
  });

  it('fails cleanly when the CODEOWNERS file cannot be read', () => {
    existsSyncMock.mockImplementation(
      (p) => String(p) === '.github/CODEOWNERS',
    );
    readFileSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    verifyCodeowners();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('EACCES: permission denied'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      'errorMessage',
      expect.stringContaining('EACCES: permission denied'),
    );
  });

  it('ignores owners-only CODEOWNERS lines with a warning naming the line', () => {
    const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});

    readFileSyncMock.mockImplementation((filepath) => {
      if (filepath === '.github/CODEOWNERS') {
        return '@global-owner\nfile1.js @team1\n';
      }
      return '';
    });

    verifyCodeowners();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@global-owner'),
    );
    // file2-5.js are unowned (the owners-only line did not become a `*`-style rule).
    expect(core.setOutput).toHaveBeenCalledWith(
      'unownedFiles',
      'file2.js\nfile3.js\nfile4.js\nfile5.js',
    );
    warnSpy.mockRestore();
  });

  it('skips verification when inputs exceed the combined size limit without failing', () => {
    const huge = 'x'.repeat(60_000);
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return huge;
      }
      if (name === 'deletedFiles') {
        return huge;
      }
      return '';
    });
    const warnSpy = vi.spyOn(core, 'warning').mockImplementation(() => {});

    verifyCodeowners();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('skipped', 'true');
    expect(core.setOutput).toHaveBeenCalledWith(
      'skipReason',
      expect.stringContaining('skipped'),
    );
  });
});

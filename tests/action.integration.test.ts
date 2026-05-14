jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: jest.fn(),
    existsSync: jest.fn(() => false),
  };
});

import * as core from '@actions/core';
import * as fs from 'fs';
import { verifyCodeowners } from '../src/action';
import { clearPatternMatcherCache } from '../src/codeowners';

const readFileSyncMock = fs.readFileSync as jest.MockedFunction<
  typeof fs.readFileSync
>;
const existsSyncMock = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;

describe('verifyCodeowners (integration)', () => {
  afterEach(() => {
    clearPatternMatcherCache();
  });

  beforeEach(() => {
    existsSyncMock.mockReturnValue(false);
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return 'file1.js file2.js file3.js file4.js file5.js';
      }
      if (name === 'deletedFiles') {
        return 'deleted1.js deleted2.js';
      }
      return '';
    });

    jest.spyOn(core, 'setFailed').mockImplementation(() => {});
    jest.spyOn(core, 'setOutput').mockImplementation(() => {});
    jest.spyOn(core, 'startGroup').mockImplementation(() => {});
    jest.spyOn(core, 'endGroup').mockImplementation(() => {});
    jest.spyOn(core, 'info').mockImplementation(() => {});
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
    expect(core.setOutput).not.toHaveBeenCalled();
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
    expect(core.setOutput).not.toHaveBeenCalled();
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
    expect(core.setOutput).not.toHaveBeenCalled();
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
    const outputOrder = (core.setOutput as jest.Mock).mock.calls.map(
      (c: [string, unknown]) => c[0],
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
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
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
    existsSyncMock.mockImplementation((p) => String(p) === '.codeownersignore');

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
      (p) => String(p) === '.github/.codeownersignore',
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
    expect(core.setOutput).not.toHaveBeenCalled();
  });

  it('fails when a global owner is overridden by a later unowned path', () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
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

  it('skips verification when inputs exceed the combined size limit without failing', () => {
    const huge = 'x'.repeat(60_000);
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'changedFiles') {
        return huge;
      }
      if (name === 'deletedFiles') {
        return huge;
      }
      return '';
    });
    const warnSpy = jest.spyOn(core, 'warning').mockImplementation(() => {});

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

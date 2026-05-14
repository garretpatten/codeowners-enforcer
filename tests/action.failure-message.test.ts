import { buildFailureMessage } from '../src/action';

describe('buildFailureMessage', () => {
  it('includes every path on its own indented bullet line', () => {
    const msg = buildFailureMessage(['src/a.ts', 'docs/read me.md']);
    expect(msg).toContain('    - src/a.ts');
    expect(msg).toContain('    - docs/read me.md');
    expect(msg.indexOf('src/a.ts')).toBeLessThan(
      msg.indexOf('docs/read me.md'),
    );
  });

  it('still produces guidance links when the list has one entry', () => {
    const msg = buildFailureMessage(['only-one.rb']);
    expect(msg).toContain('    - only-one.rb');
    expect(msg).toContain('about-code-owners');
    expect(msg).toContain('codeownersignore');
  });
});

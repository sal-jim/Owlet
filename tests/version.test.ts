import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FALLBACK_VERSION,
  formatVersionLine,
  getCliVersion,
  resolveGitSha,
  resolvePackageVersion,
} from '../src/lib/version.js';

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owlet-version-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('getCliVersion', () => {
  afterEach(() => {
    delete process.env.OWLET_VERSION;
    delete process.env.OWLET_GIT_SHA;
  });

  it('reads package.json version when available', () => {
    const raw = fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    expect(resolvePackageVersion()).toBe(pkg.version);
  });

  it('formats injected version + sha', () => {
    process.env.OWLET_VERSION = '9.9.9';
    process.env.OWLET_GIT_SHA = 'abcdef123456';
    expect(formatVersionLine('not a url')).toBe('9.9.9 (abcdef12)');
  });

  it('resolves package.json version from importMetaUrl root', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
      const entry = path.join(dir, 'src', 'entry.ts');
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.writeFileSync(entry, '// noop');

      expect(resolvePackageVersion(pathToFileURL(entry).href)).toBe('1.2.3');
    });
  });

  it('falls back to VERSION file when package.json missing', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'VERSION'), '2.0.0\n');
      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolvePackageVersion(pathToFileURL(entry).href)).toBe('2.0.0');
    });
  });

  it('falls back to VERSION file when package.json has no version', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(dir, 'VERSION'), '5.5.5\n');
      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolvePackageVersion(pathToFileURL(entry).href)).toBe('5.5.5');
    });
  });

  it('falls back to unknown when no version files exist', () => {
    withTempDir((dir) => {
      const entry = path.join(dir, 'a', 'b', 'c', 'entry.ts');
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.writeFileSync(entry, '// noop');

      expect(resolvePackageVersion(pathToFileURL(entry).href)).toBe(FALLBACK_VERSION);
    });
  });

  it('returns null when git HEAD is missing', () => {
    withTempDir((dir) => {
      const gitDir = path.join(dir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBeNull();
    });
  });

  it('returns null when git ref cannot be resolved', () => {
    withTempDir((dir) => {
      const gitDir = path.join(dir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBeNull();
    });
  });

  it('resolves git sha from .git directory HEAD', () => {
    withTempDir((dir) => {
      const gitDir = path.join(dir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBe('01234567');
    });
  });

  it('resolves git sha from ref file and packed-refs', () => {
    withTempDir((dir) => {
      const gitDir = path.join(dir, '.git');
      fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBe('aaaaaaaa');

      fs.rmSync(path.join(gitDir, 'refs', 'heads', 'main'), { force: true });
      fs.writeFileSync(
        path.join(gitDir, 'packed-refs'),
        ['# pack-refs with: peeled fully-peeled', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb refs/heads/main', ''].join(
          '\n',
        ),
      );
      expect(resolveGitSha(pathToFileURL(entry).href)).toBe('bbbbbbbb');
    });
  });

  it('resolves git sha from .git file gitdir pointer', () => {
    withTempDir((dir) => {
      const realGitDir = path.join(dir, '.realgit');
      fs.mkdirSync(realGitDir, { recursive: true });
      fs.writeFileSync(path.join(realGitDir, 'HEAD'), 'cccccccccccccccccccccccccccccccccccccccc\n');
      fs.writeFileSync(path.join(dir, '.git'), 'gitdir: .realgit\n');

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBe('cccccccc');
    });
  });

  it('returns null when no git directory exists', () => {
    withTempDir((dir) => {
      const entry = path.join(dir, 'nested', 'entry.ts');
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.writeFileSync(entry, '// noop');

      expect(resolveGitSha(pathToFileURL(entry).href)).toBeNull();
    });
  });

  it('formats version line with version + sha when both available', () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '3.3.3' }));
      const gitDir = path.join(dir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'dddddddddddddddddddddddddddddddddddddddd\n');

      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, '// noop');

      expect(formatVersionLine(pathToFileURL(entry).href)).toBe('3.3.3 (dddddddd)');
    });
  });

  it('returns a CLI version string', () => {
    const value = getCliVersion();
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});

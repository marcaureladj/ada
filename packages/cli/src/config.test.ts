import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'ada-cfg-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadConfig (CLI overrides)', () => {
  it('builds a valid config from URL+output args alone', () => {
    const config = loadConfig({
      url: 'https://example.com',
      output: './out.mp4',
      language: 'en',
    });
    assert.equal(config.project.url, 'https://example.com');
    assert.equal(config.project.language, 'en');
    assert.equal(config.output.path, './out.mp4');
  });

  it('throws ConfigError on invalid URL', () => {
    assert.throws(() => loadConfig({ url: 'not-a-url', output: './x.mp4' }), /Invalid url/);
  });

  it('parses credentials in email:password format', () => {
    const config = loadConfig({
      url: 'https://example.com',
      output: './x.mp4',
      credentials: 'alice@test.com:hunter2',
    });
    assert.equal(config.auth?.type, 'credentials');
    assert.equal(config.auth?.email, 'alice@test.com');
    assert.equal(config.auth?.password, 'hunter2');
  });
});

describe('loadConfig (YAML)', () => {
  it('loads a YAML file with env var interpolation', () => {
    withTempDir((dir) => {
      const path = join(dir, 'ada.yaml');
      writeFileSync(
        path,
        `project:
  name: TestApp
  url: \${TEST_URL}
  language: fr
output:
  path: ./demo.mp4
providers: {}
`,
        'utf8',
      );
      process.env['TEST_URL'] = 'https://test.example.com';
      try {
        const config = loadConfig({ configPath: path });
        assert.equal(config.project.url, 'https://test.example.com');
      } finally {
        delete process.env['TEST_URL'];
      }
    });
  });

  it('throws when YAML file does not exist', () => {
    assert.throws(
      () => loadConfig({ configPath: '/nonexistent/path/ada.yaml' }),
      /introuvable/,
    );
  });

  it('throws when interpolated env var is missing', () => {
    withTempDir((dir) => {
      const path = join(dir, 'ada.yaml');
      writeFileSync(
        path,
        `project:
  name: TestApp
  url: \${MISSING_VAR_XYZ}
  language: fr
output:
  path: ./demo.mp4
providers: {}
`,
        'utf8',
      );
      assert.throws(() => loadConfig({ configPath: path }), /MISSING_VAR_XYZ/);
    });
  });
});

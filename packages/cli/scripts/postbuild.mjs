#!/usr/bin/env node
// Postbuild: ensure the CLI entrypoint is executable on POSIX systems (no-op on Windows).
import { chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

if (existsSync(cliPath)) {
  try {
    chmodSync(cliPath, 0o755);
  } catch {
    // chmod is a no-op on Windows; ignore.
  }
}

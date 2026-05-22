#!/usr/bin/env node
// Runs the ADA pipeline against the 5 integration fixtures and writes a JSON
// summary into tests/integration/results/<timestamp>.json.
//
// Usage:
//   node tests/integration/run-suite.mjs --mode=plan-only
//   node tests/integration/run-suite.mjs --mode=mock
//   ADA_FAIL_FAST=1 node tests/integration/run-suite.mjs --mode=full

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURES_DIR = join(__dirname, 'fixtures');
const RESULTS_DIR = join(__dirname, 'results');

const APPS = ['calcom', 'plane', 'documenso', 'twenty', 'formbricks'];

function parseArgs(argv) {
  const out = { mode: 'plan-only', delayMs: 2000 };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--mode=')) out.mode = arg.slice('--mode='.length);
    if (arg.startsWith('--delay=')) out.delayMs = Number(arg.slice('--delay='.length));
    if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function help() {
  console.log(`Usage: node tests/integration/run-suite.mjs [--mode=<plan-only|mock|full>] [--delay=<ms>]

Modes:
  plan-only  Run only \`ada plan\` per app. Needs ANTHROPIC_API_KEY or OPENAI_API_KEY. ~$0.05.
  mock       Run full pipeline with ADA_MOCK=1 (no network). $0.
  full       Run real \`ada run\` per app. Needs all API keys + app credentials. ~$5-10.

Apps tested: ${APPS.join(', ')}.

ADA_FAIL_FAST=1   stop the suite at the first failed app.
ADA_RUN_DELAY_MS  override cooldown between apps (default 2000ms).
`);
}

function spawnAda(args, env = {}) {
  return new Promise((resolve) => {
    const cliPath = join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js');
    const stdoutChunks = [];
    const stderrChunks = [];
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, ...env },
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => stdoutChunks.push(d));
    child.stderr.on('data', (d) => stderrChunks.push(d));
    child.on('close', (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      }),
    );
  });
}

function tryParseJson(text) {
  // CLI outputs structured JSON on stdout; in plan-only mode it's a ScenarioPlan
  // and in run mode it's a RunReport. Find the first { and parse from there.
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return null;
  }
}

async function runAppPlanOnly(app) {
  const start = Date.now();
  const fixture = join(FIXTURES_DIR, `${app}.yaml`);
  const { code, stdout, stderr } = await spawnAda([
    'plan',
    '--config',
    fixture,
    '--output-format',
    'json',
  ]);
  const durationMs = Date.now() - start;
  const payload = tryParseJson(stdout);
  const passed = code === 0 && payload && Array.isArray(payload.scenes) && payload.scenes.length > 0;
  return {
    appName: app,
    mode: 'plan-only',
    status: passed ? 'success' : 'failed',
    exitCode: code,
    durationMs,
    sceneCount: payload?.scenes?.length ?? 0,
    errorMessage: passed ? undefined : (payload?.message ?? stderr.slice(0, 500)),
  };
}

async function runAppMock(app) {
  const start = Date.now();
  const fixture = join(FIXTURES_DIR, `${app}.yaml`);
  // The fixtures interpolate `${ADA_<APP>_EMAIL}` / `${ADA_<APP>_PASSWORD}`.
  // In mock mode we don't actually hit the SaaS, so we inject placeholders so
  // the YAML loader doesn't reject the config.
  const upper = app.toUpperCase();
  const credEnv = {
    [`ADA_${upper}_EMAIL`]: process.env[`ADA_${upper}_EMAIL`] ?? 'mock@example.com',
    [`ADA_${upper}_PASSWORD`]: process.env[`ADA_${upper}_PASSWORD`] ?? 'mock-password',
  };
  const { code, stdout, stderr } = await spawnAda(
    ['run', '--config', fixture, '--dry-run', '--output-format', 'json'],
    { ADA_MOCK: '1', ...credEnv },
  );
  const durationMs = Date.now() - start;
  const report = tryParseJson(stdout);
  // In mock+dry-run mode, the pipeline stops at the Planner — RunReport.status
  // is 'partial'. That's the expected pass condition: config loaded, mocks
  // resolved, planner produced scenes.
  const rawStatus = report?.status ?? (code === 0 ? 'success' : 'failed');
  const status = rawStatus === 'partial' ? 'success' : rawStatus;
  return {
    appName: app,
    mode: 'mock',
    status,
    exitCode: code,
    durationMs,
    errorMessage:
      report?.errors?.length > 0
        ? report.errors.join(' | ')
        : status !== 'success' && stderr
          ? stderr.slice(0, 500)
          : undefined,
  };
}

async function runAppFull(app) {
  const start = Date.now();
  const fixture = join(FIXTURES_DIR, `${app}.yaml`);
  const { code, stdout, stderr } = await spawnAda([
    'run',
    '--config',
    fixture,
    '--output-format',
    'json',
  ]);
  const durationMs = Date.now() - start;
  const report = tryParseJson(stdout);
  return {
    appName: app,
    mode: 'full',
    status: report?.status ?? (code === 0 ? 'success' : 'failed'),
    exitCode: code,
    durationMs,
    outputPath: report?.outputPath,
    stageTimings: report?.stageTimings,
    successRate: report?.successRate,
    retries: report?.retries,
    estimatedCostUsd: report?.estimatedCostUsd,
    errorMessage:
      report?.errors?.length > 0
        ? report.errors.join(' | ')
        : status !== 'success' && stderr
          ? stderr.slice(0, 500)
          : undefined,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return help();

  if (!['plan-only', 'mock', 'full'].includes(args.mode)) {
    console.error(`Mode invalide : ${args.mode}`);
    process.exit(1);
  }

  const cliPath = join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js');
  if (!existsSync(cliPath)) {
    console.error(`CLI build introuvable : ${cliPath}. Lance \`pnpm -r build\` d'abord.`);
    process.exit(1);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const failFast = process.env.ADA_FAIL_FAST === '1';
  const delayMs = Number(process.env.ADA_RUN_DELAY_MS ?? args.delayMs);

  console.log(`Mode: ${args.mode} | Apps: ${APPS.length} | cooldown: ${delayMs}ms`);
  const results = [];
  for (const app of APPS) {
    process.stdout.write(`  ${app.padEnd(12)} ... `);
    let result;
    try {
      if (args.mode === 'plan-only') result = await runAppPlanOnly(app);
      else if (args.mode === 'mock') result = await runAppMock(app);
      else result = await runAppFull(app);
    } catch (err) {
      result = {
        appName: app,
        mode: args.mode,
        status: 'failed',
        exitCode: -1,
        durationMs: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    results.push(result);
    const symbol = result.status === 'success' ? '✓' : result.status === 'partial' ? '~' : '✗';
    console.log(`${symbol} ${result.status} (${result.durationMs}ms)`);
    if (result.status === 'failed' && failFast) {
      console.log('  fail-fast set → stopping suite.');
      break;
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  const passCount = results.filter((r) => r.status === 'success').length;
  const passRate = passCount / APPS.length;
  const summary = {
    mode: args.mode,
    timestamp: new Date().toISOString(),
    passCount,
    totalCount: APPS.length,
    passRate,
    targetPassRate: 0.8,
    metTarget: passRate >= 0.8,
    results,
  };

  const filename = join(
    RESULTS_DIR,
    `${args.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(filename, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nPass: ${passCount}/${APPS.length} (${(passRate * 100).toFixed(0)}%)`);
  console.log(`Cible CDC §6.2 : ${summary.metTarget ? '✓ atteinte' : '✗ non atteinte'} (≥ 80%)`);
  console.log(`Résultats : ${filename}`);

  process.exit(summary.metTarget ? 0 : 1);
}

// Export internals for unit-test use.
export { parseArgs, tryParseJson, APPS };

if (process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('run-suite.mjs'))) {
  await main();
}

// Suppress unused import warning for readdirSync (kept available for future
// "compare last 5 runs" feature in aggregate.mjs).
void readdirSync;
void readFileSync;

#!/usr/bin/env node
// Aggregates the JSON files in tests/integration/results/ into a Markdown
// report (README-RESULTS.md) showing per-app pass rate + overall metric vs
// the CDC §6.2 80% target.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');
const OUTPUT = join(__dirname, 'README-RESULTS.md');

function loadResults() {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = readFileSync(join(RESULTS_DIR, f), 'utf8');
      try {
        return { file: f, ...JSON.parse(content) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function lastRunByApp(allRuns) {
  // Keeps the most recent result per (app, mode).
  const map = new Map();
  for (const run of allRuns) {
    for (const result of run.results) {
      const key = `${result.appName}|${result.mode}`;
      if (!map.has(key)) {
        map.set(key, { ...result, timestamp: run.timestamp });
      }
    }
  }
  return map;
}

function statusEmoji(status) {
  if (status === 'success') return '✅';
  if (status === 'partial') return '🟡';
  return '❌';
}

function fmtMs(ms) {
  if (typeof ms !== 'number') return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(usd) {
  if (typeof usd !== 'number') return '—';
  return `$${usd.toFixed(4)}`;
}

function buildMarkdown(runs) {
  const apps = ['calcom', 'plane', 'documenso', 'twenty', 'formbricks'];
  const lastByKey = lastRunByApp(runs);
  const latestRun = runs[0];

  let md = `# Integration Suite Results\n\n`;
  md += `_Généré le ${new Date().toISOString()}._\n\n`;

  if (!latestRun) {
    md += `Aucun résultat encore — lance \`pnpm integration:plan\` ou \`pnpm integration:full\`.\n`;
    return md;
  }

  md += `## Dernière exécution (${latestRun.mode})\n\n`;
  md += `- Date : ${latestRun.timestamp}\n`;
  md += `- Pass : **${latestRun.passCount}/${latestRun.totalCount}** (${(latestRun.passRate * 100).toFixed(0)}%)\n`;
  md += `- Cible CDC §6.2 (≥ 80 %) : ${latestRun.metTarget ? '✅ atteinte' : '❌ non atteinte'}\n\n`;

  md += `## Dernière passage par app et par mode\n\n`;
  md += `| App | Mode | Statut | Durée | Coût | Erreur |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const app of apps) {
    for (const mode of ['plan-only', 'mock', 'full']) {
      const entry = lastByKey.get(`${app}|${mode}`);
      if (!entry) {
        md += `| ${app} | ${mode} | — | — | — | — |\n`;
        continue;
      }
      const err = entry.errorMessage
        ? entry.errorMessage.slice(0, 80).replace(/\|/g, '\\|')
        : '';
      md += `| ${app} | ${mode} | ${statusEmoji(entry.status)} ${entry.status} | ${fmtMs(entry.durationMs)} | ${fmtCost(entry.estimatedCostUsd)} | ${err} |\n`;
    }
  }

  md += `\n## Historique récent\n\n`;
  md += `| Date | Mode | Pass rate | Cible atteinte |\n|---|---|---|---|\n`;
  for (const run of runs.slice(0, 10)) {
    md += `| ${run.timestamp.slice(0, 19).replace('T', ' ')} | ${run.mode} | ${(run.passRate * 100).toFixed(0)}% | ${run.metTarget ? '✅' : '❌'} |\n`;
  }

  return md;
}

function main() {
  const runs = loadResults();
  const md = buildMarkdown(runs);
  writeFileSync(OUTPUT, md, 'utf8');
  console.log(`Wrote ${OUTPUT} (${runs.length} run${runs.length === 1 ? '' : 's'})`);
}

void resolve;

main();

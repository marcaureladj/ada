#!/usr/bin/env node
import 'dotenv/config';
import { Command, Option } from 'commander';
import { ADA_VERSION } from '@ada/core';
import { runCommand } from './commands/run.js';
import { planCommand } from './commands/plan.js';
import { composeCommand } from './commands/compose.js';
import { initCommand } from './commands/init.js';
import type { OutputFormat } from './output.js';

const outputFormatOption = new Option(
  '--output-format <fmt>',
  'Format de sortie pour consommation par un agent',
)
  .choices(['text', 'json'])
  .default('text');

const program = new Command();

program
  .name('ada')
  .description(
    'ADA — Autonomous Documentation Agent. Génère une vidéo de documentation à partir d\'une URL via un agent IA + HyperFrames.',
  )
  .version(ADA_VERSION);

program
  .command('run')
  .description('Pipeline complet : agent IA → script → voix off → composition → MP4.')
  .option('-u, --url <url>', "URL de l'application à documenter")
  .option('-c, --credentials <creds>', 'Identifiants au format email:password')
  .option('-o, --output <file>', 'Chemin du MP4 de sortie')
  .option('--config <path>', 'Chemin vers ada.yaml (sinon args CLI uniquement)')
  .option('--language <lang>', 'Langue de sortie (fr|en)')
  .option('--template <name>', 'Template HyperFrames (classic|framed|split|social)')
  .option('--dry-run', 'Planifie sans générer la vidéo')
  .addOption(outputFormatOption)
  .action(async (opts) => {
    const code = await runCommand({
      url: opts.url,
      credentials: opts.credentials,
      output: opts.output,
      config: opts.config,
      language: opts.language,
      template: opts.template,
      dryRun: opts.dryRun,
      outputFormat: opts.outputFormat as OutputFormat,
    });
    process.exit(code);
  });

program
  .command('plan')
  .description("Génère uniquement le plan de scénarios (scenarios.json), sans navigation ni rendu.")
  .option('-u, --url <url>', "URL de l'application à documenter")
  .option('--config <path>', 'Chemin vers ada.yaml')
  .option('--language <lang>', 'Langue de sortie (fr|en)')
  .addOption(outputFormatOption)
  .action(async (opts) => {
    const code = await planCommand({
      url: opts.url,
      config: opts.config,
      language: opts.language,
      outputFormat: opts.outputFormat as OutputFormat,
    });
    process.exit(code);
  });

program
  .command('compose')
  .description("Génère la composition HyperFrames (HTML + assets) sans la rendre.")
  .option('-u, --url <url>', "URL de l'application à documenter")
  .option('-o, --output <dir>', 'Dossier de sortie de la composition')
  .option('--config <path>', 'Chemin vers ada.yaml')
  .option('--template <name>', 'Template HyperFrames')
  .addOption(outputFormatOption)
  .action(async (opts) => {
    const code = await composeCommand({
      url: opts.url,
      output: opts.output,
      config: opts.config,
      template: opts.template,
      outputFormat: opts.outputFormat as OutputFormat,
    });
    process.exit(code);
  });

program
  .command('init')
  .description('Crée un fichier ada.yaml dans le dossier courant.')
  .option('-o, --output-path <path>', 'Chemin du fichier à créer', 'ada.yaml')
  .option('-f, --force', "Écraser le fichier s'il existe", false)
  .addOption(outputFormatOption)
  .action(async (opts) => {
    const code = await initCommand({
      outputPath: opts.outputPath,
      force: opts.force,
      outputFormat: opts.outputFormat as OutputFormat,
    });
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`[ada] fatal: ${(err as Error).message}\n`);
  process.exit(2);
});

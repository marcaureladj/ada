import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, AdaError } from '@ada/core';
import { emit, emitError, type OutputFormat } from '../output.js';

export interface InitOptions {
  outputPath?: string;
  force?: boolean;
  outputFormat: OutputFormat;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initCommand(options: InitOptions): Promise<number> {
  try {
    const target = resolve(process.cwd(), options.outputPath ?? 'ada.yaml');
    if (existsSync(target) && !options.force) {
      throw new ConfigError(
        `Le fichier ${target} existe déjà. Utilisez --force pour l'écraser.`,
      );
    }
    // dist/commands/init.js → packages/cli/templates/ada.yaml.tpl
    const templatePath = resolve(__dirname, '..', '..', 'templates', 'ada.yaml.tpl');
    if (!existsSync(templatePath)) {
      throw new ConfigError(`Template ada.yaml introuvable : ${templatePath}`);
    }
    copyFileSync(templatePath, target);
    emit(
      options.outputFormat,
      { ok: true, path: target },
      `Fichier de configuration créé : ${target}`,
    );
    return 0;
  } catch (err) {
    if (err instanceof AdaError) {
      emitError(options.outputFormat, err.code, err.message);
      return err.code === 'E_CONFIG' ? 1 : 2;
    }
    emitError(options.outputFormat, 'E_RUNTIME', (err as Error).message);
    return 2;
  }
}

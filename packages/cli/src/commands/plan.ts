import { AdaError } from '@ada/core';
import { loadConfig } from '../config.js';
import { emit, emitError, type OutputFormat } from '../output.js';
import { buildPipelineDeps } from '../wire.js';

export interface PlanOptions {
  url?: string;
  config?: string;
  language?: 'fr' | 'en';
  outputFormat: OutputFormat;
}

export async function planCommand(options: PlanOptions): Promise<number> {
  try {
    const config = loadConfig({
      ...(options.config !== undefined ? { configPath: options.config } : {}),
      ...(options.url !== undefined ? { url: options.url } : {}),
      ...(options.language !== undefined ? { language: options.language } : {}),
      output: './demo.mp4',
    });
    const { planner } = buildPipelineDeps(config);
    const plan = await planner.plan(config);
    emit(
      options.outputFormat,
      plan,
      `Plan généré : ${plan.scenes.length} scènes (${plan.language}).`,
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

import { runPipeline, AdaError } from '@ada/core';
import { loadConfig } from '../config.js';
import { emit, emitError, type OutputFormat } from '../output.js';
import { logger } from '../logger.js';
import { buildPipelineDeps } from '../wire.js';

export interface RunOptions {
  url?: string;
  credentials?: string;
  output?: string;
  config?: string;
  language?: 'fr' | 'en';
  template?: string;
  dryRun?: boolean;
  outputFormat: OutputFormat;
}

export async function runCommand(options: RunOptions): Promise<number> {
  const abortController = new AbortController();
  const onSigint = (): void => abortController.abort();
  process.once('SIGINT', onSigint);

  try {
    const config = loadConfig({
      ...(options.config !== undefined ? { configPath: options.config } : {}),
      ...(options.url !== undefined ? { url: options.url } : {}),
      ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
      ...(options.output !== undefined ? { output: options.output } : {}),
      ...(options.language !== undefined ? { language: options.language } : {}),
      ...(options.template !== undefined ? { template: options.template } : {}),
    });

    logger.info({ url: config.project.url, template: config.output.template }, 'starting ada run');
    const { deps, providerSink } = buildPipelineDeps(config);
    const report = await runPipeline(config, deps, {
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      onProgress: (event) => logger.debug(event, 'pipeline event'),
      eventSink: providerSink,
      abortSignal: abortController.signal,
    });

    emit(
      options.outputFormat,
      report,
      `Run terminé (${report.status}) en ${report.durationMs}ms → ${report.outputPath ?? '(no output)'}`,
    );
    return report.status === 'success' ? 0 : 2;
  } catch (err) {
    if (err instanceof AdaError) {
      emitError(options.outputFormat, err.code, err.message);
      return err.code === 'E_CONFIG' ? 1 : 2;
    }
    emitError(options.outputFormat, 'E_RUNTIME', (err as Error).message);
    return 2;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

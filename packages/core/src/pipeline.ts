import { writeFileSync } from 'node:fs';
import { AdaError, ConfigError } from './errors.js';
import type {
  AudioSegment,
  AuthReport,
  NavigationTrace,
  RunConfig,
  RunReport,
  Script,
  ScenarioPlan,
} from './types.js';
import { createWorkdir, type Workdir } from './workdir.js';
import { CostAccumulator } from './utils/cost.js';
import type { Planner } from './modules/planner.js';
import type { Navigator } from './modules/navigator.js';
import type { Scripter } from './modules/scripter.js';
import type { Voicer } from './modules/voicer.js';
import type { Composer } from './modules/composer.js';

export interface PipelineDeps {
  planner: Planner;
  navigator: Navigator;
  scripter: Scripter;
  voicer: Voicer;
  composer: Composer;
}

export interface PipelineOptions {
  dryRun?: boolean;
  baseDir?: string;
  onProgress?: (event: PipelineEvent) => void;
}

export type PipelineEvent =
  | { stage: 'planner'; status: 'start' | 'done' | 'error'; detail?: string }
  | { stage: 'navigator'; status: 'start' | 'done' | 'error'; sceneId?: string; detail?: string }
  | { stage: 'scripter'; status: 'start' | 'done' | 'error'; detail?: string }
  | { stage: 'voicer'; status: 'start' | 'done' | 'error'; detail?: string }
  | { stage: 'composer'; status: 'start' | 'done' | 'error'; detail?: string };

function writeReport(workdir: Workdir, report: RunReport): void {
  writeFileSync(workdir.reportJson, JSON.stringify(report, null, 2), 'utf8');
}

export async function runPipeline(
  config: RunConfig,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<RunReport> {
  const startedAt = new Date();
  const workdir = createWorkdir(options.baseDir);
  const errors: string[] = [];
  let scenarioPlan: ScenarioPlan | null = null;
  const traces: NavigationTrace[] = [];
  let script: Script | null = null;
  let audio: AudioSegment[] = [];
  let outputPath: string | undefined;
  let authReport: AuthReport | undefined;
  const cost = new CostAccumulator();
  // Map provider names from the registry onto the cost-pricing taxonomy so
  // the report reflects what the user actually pays for.
  const textProviderTax = config.providers.text.startsWith('openai') ? 'openai' : 'claude';
  const ttsProviderTax = config.providers.tts.startsWith('openai') ? 'openai' : 'elevenlabs';
  cost.setProviders(textProviderTax, ttsProviderTax);

  const emit = (event: PipelineEvent) => options.onProgress?.(event);
  const baseReport = (status: RunReport['status']): RunReport => {
    const finishedAt = new Date();
    // Coarse estimate: TTS characters are exact, LLM tokens approximated from
    // the volume of generated text + the number of agent actions × a fudge
    // factor for the screenshot tokens (~1.5k per image for Claude).
    if (script) {
      const ttsChars = script.segments.reduce((acc, s) => acc + s.text.length, 0);
      cost.add({ ttsCharacters: ttsChars });
      const outChars = ttsChars * 2; // script + scenario together
      cost.add({ textOutputTokens: Math.round(outChars / 4) });
    }
    if (traces.length > 0) {
      const actionCount = traces.reduce((acc, t) => acc + t.actions.length, 0);
      // Each Computer Use turn ships a screenshot + prompt → ~1500 input tokens.
      cost.add({ visionInputTokens: actionCount * 1500 });
    }
    const snap = cost.snapshot();
    const report: RunReport = {
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      scenes: traces,
      providersUsed: {
        vision: config.providers.vision,
        text: config.providers.text,
        tts: config.providers.tts,
      },
      estimatedCostUsd: snap.estimatedCostUsd,
      errors,
      ...(outputPath !== undefined ? { outputPath } : {}),
      ...(authReport !== undefined ? { authReport } : {}),
      ...(script
        ? {
            subtitlesPath: { srt: workdir.subtitlesSrt, vtt: workdir.subtitlesVtt },
            transcriptPath: workdir.transcriptMd,
          }
        : {}),
    };
    writeReport(workdir, report);
    return report;
  };

  // --- Fail-fast: credentials required but missing ---
  if (config.auth?.type === 'credentials') {
    if (!config.auth.email || !config.auth.password) {
      const err = new ConfigError(
        'auth.type=credentials requiert email + password (vérifiez l\'interpolation ${VAR} dans ada.yaml).',
      );
      errors.push(`pipeline: ${err.message}`);
      return baseReport('failed');
    }
  }
  if (config.auth?.type === 'api_key' && !config.auth.apiKey) {
    const err = new ConfigError('auth.type=api_key requiert auth.apiKey.');
    errors.push(`pipeline: ${err.message}`);
    return baseReport('failed');
  }

  // --- Planner ---
  emit({ stage: 'planner', status: 'start' });
  try {
    scenarioPlan = await deps.planner.plan(config);
    writeFileSync(workdir.scenariosJson, JSON.stringify(scenarioPlan, null, 2), 'utf8');
    emit({ stage: 'planner', status: 'done', detail: `${scenarioPlan.scenes.length} scènes` });
  } catch (err) {
    const message = err instanceof AdaError ? err.message : (err as Error).message;
    errors.push(`planner: ${message}`);
    emit({ stage: 'planner', status: 'error', detail: message });
    return baseReport('failed');
  }

  if (options.dryRun) {
    return baseReport('partial');
  }

  // --- Navigator ---
  try {
    await deps.navigator.open();

    // --- Auth (one-shot before any scene) ---
    if (config.auth && config.auth.type !== 'none') {
      authReport = await deps.navigator.authenticate(config, workdir);
      if (authReport && !authReport.success) {
        errors.push(`auth: ${authReport.error ?? 'unknown failure'}`);
        return baseReport('failed');
      }
    }

    for (const scene of scenarioPlan.scenes) {
      emit({ stage: 'navigator', status: 'start', sceneId: scene.id });
      try {
        const trace = await deps.navigator.execute(config, scene, workdir);
        traces.push(trace);
        emit({
          stage: 'navigator',
          status: trace.success ? 'done' : 'error',
          sceneId: scene.id,
          ...(trace.error !== undefined ? { detail: trace.error } : {}),
        });
        if (!trace.success && trace.error) errors.push(`navigator:${scene.id}: ${trace.error}`);
      } catch (err) {
        const message = err instanceof AdaError ? err.message : (err as Error).message;
        errors.push(`navigator:${scene.id}: ${message}`);
        traces.push({
          sceneId: scene.id,
          actions: [],
          capturePath: '',
          durationSec: 0,
          success: false,
          error: message,
        });
        emit({ stage: 'navigator', status: 'error', sceneId: scene.id, detail: message });
      }
    }
  } finally {
    await deps.navigator.close();
  }

  const successfulTraces = traces.filter((t) => t.success);
  if (successfulTraces.length === 0) {
    return baseReport('failed');
  }

  // --- Scripter ---
  emit({ stage: 'scripter', status: 'start' });
  try {
    script = await deps.scripter.generate(config, successfulTraces);
    writeFileSync(workdir.scriptJson, JSON.stringify(script, null, 2), 'utf8');
    emit({ stage: 'scripter', status: 'done', detail: `${script.segments.length} segments` });
  } catch (err) {
    const message = err instanceof AdaError ? err.message : (err as Error).message;
    errors.push(`scripter: ${message}`);
    emit({ stage: 'scripter', status: 'error', detail: message });
    return baseReport('partial');
  }

  // --- Voicer ---
  emit({ stage: 'voicer', status: 'start' });
  try {
    audio = await deps.voicer.synthesize(config, script, workdir);
    emit({ stage: 'voicer', status: 'done', detail: `${audio.length} segments audio` });
  } catch (err) {
    const message = err instanceof AdaError ? err.message : (err as Error).message;
    errors.push(`voicer: ${message}`);
    emit({ stage: 'voicer', status: 'error', detail: message });
    return baseReport('partial');
  }

  // --- Composer ---
  emit({ stage: 'composer', status: 'start' });
  try {
    const composition = await deps.composer.compose(config, script, audio, successfulTraces, workdir);
    outputPath = await deps.composer.render(config, composition, workdir);
    emit({ stage: 'composer', status: 'done', detail: outputPath });
  } catch (err) {
    const message = err instanceof AdaError ? err.message : (err as Error).message;
    errors.push(`composer: ${message}`);
    emit({ stage: 'composer', status: 'error', detail: message });
    return baseReport('partial');
  }

  return baseReport('success');
}

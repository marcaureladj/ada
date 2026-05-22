import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { AdaError, ConfigError } from './errors.js';
import type {
  AudioSegment,
  AuthReport,
  NavigationTrace,
  RunConfig,
  RunReport,
  Script,
  ScenarioPlan,
  StageTimings,
  SuccessRate,
  UsageBreakdown,
} from './types.js';
import { createWorkdir, type Workdir } from './workdir.js';
import { CostAccumulator } from './utils/cost.js';
import {
  countRetriesByProvider,
  createCompositeEventSink,
  createFileEventSink,
  createMemoryEventSink,
  type EventSink,
  type EventStage,
  type RelayEventSink,
} from './events.js';
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
  abortSignal?: AbortSignal;
  /**
   * Custom event sink. When omitted, the pipeline creates a composite of a
   * file sink (workdir/events.ndjson) plus an in-memory sink used for the
   * retry summary.
   */
  eventSink?: EventSink;
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

function computeSuccessRate(traces: NavigationTrace[]): SuccessRate {
  let actionsTotal = 0;
  let actionsOk = 0;
  let scenesOk = 0;
  let scenesFailed = 0;
  for (const trace of traces) {
    if (trace.success) scenesOk += 1;
    else scenesFailed += 1;
    actionsTotal += trace.actions.length;
    for (const a of trace.actions) {
      // An action is "failed" if its reasoning was tagged ÉCHEC by the
      // Navigator's retry loop. A clean trace reports a count of OK actions.
      if (!a.reasoning.includes('ÉCHEC')) actionsOk += 1;
    }
  }
  return {
    scenes: { total: traces.length, ok: scenesOk, failed: scenesFailed },
    actions: { total: actionsTotal, ok: actionsOk, failed: actionsTotal - actionsOk },
  };
}

function usageFromCost(snapshot: ReturnType<CostAccumulator['snapshot']>): UsageBreakdown {
  return {
    textInputTokens: snapshot.textInputTokens ?? 0,
    textOutputTokens: snapshot.textOutputTokens ?? 0,
    visionInputTokens: snapshot.visionInputTokens ?? 0,
    ttsCharacters: snapshot.ttsCharacters ?? 0,
  };
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
  // Treat all OpenAI-compatible providers (vertex/fal/replicate/openai-compat)
  // as 'openai' for coarse pricing; users can override with explicit cost
  // tracking later.
  const OPENAI_LIKE = new Set([
    'openai',
    'vertex',
    'fal',
    'replicate',
    'openai-compat',
  ]);
  const textProviderTax = OPENAI_LIKE.has(config.providers.text) ? 'openai' : 'claude';
  const ttsProviderTax = config.providers.tts.startsWith('openai')
    ? 'openai'
    : 'elevenlabs';
  cost.setProviders(textProviderTax, ttsProviderTax);

  // Build event sink. The memory sink collects events for the in-process
  // retry summary; the file sink persists them on disk for later analysis.
  const memorySink = createMemoryEventSink(workdir.id);
  const fileSink = createFileEventSink(workdir);
  const internalSink = createCompositeEventSink(memorySink, fileSink);
  // If the caller provided a RelaySink (e.g. wire.ts shared with providers),
  // attach the internal sink as its downstream so provider events land here.
  const userSink = options.eventSink as (EventSink & Partial<RelayEventSink>) | undefined;
  if (userSink?.setDownstream) {
    userSink.setDownstream(internalSink);
  }
  const sink: EventSink =
    userSink && !userSink.setDownstream
      ? createCompositeEventSink(userSink, internalSink)
      : internalSink;

  const stageTimings: StageTimings = {};
  const aborted = (): boolean => options.abortSignal?.aborted ?? false;
  const emitPipeline = (event: PipelineEvent) => {
    options.onProgress?.(event);
    const stage = event.stage as EventStage;
    sink.emit({
      level: event.status === 'error' ? 'error' : 'info',
      stage,
      type: `pipeline.${event.stage}.${event.status}`,
      payload: {
        ...('sceneId' in event && event.sceneId ? { sceneId: event.sceneId } : {}),
        ...('detail' in event && event.detail ? { detail: event.detail } : {}),
      },
      ...('sceneId' in event && event.sceneId ? { sceneId: event.sceneId } : {}),
    });
  };

  async function withStageTiming<T>(
    stage: keyof StageTimings,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      stageTimings[stage] = Math.round(performance.now() - start);
    }
  }

  const baseReport = (status: RunReport['status']): RunReport => {
    const finishedAt = new Date();
    if (script) {
      const ttsChars = script.segments.reduce((acc, s) => acc + s.text.length, 0);
      cost.add({ ttsCharacters: ttsChars });
      const outChars = ttsChars * 2;
      cost.add({ textOutputTokens: Math.round(outChars / 4) });
    }
    if (traces.length > 0) {
      const actionCount = traces.reduce((acc, t) => acc + t.actions.length, 0);
      cost.add({ visionInputTokens: actionCount * 1500 });
    }
    const snap = cost.snapshot();
    const retries = countRetriesByProvider(memorySink.events);
    const successRate = computeSuccessRate(traces);
    const usage = usageFromCost(snap);

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
      stageTimings,
      successRate,
      retries,
      usage,
      eventLogPath: workdir.eventsNdjson,
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
      await sink.close();
      return baseReport('failed');
    }
  }
  if (config.auth?.type === 'api_key' && !config.auth.apiKey) {
    const err = new ConfigError('auth.type=api_key requiert auth.apiKey.');
    errors.push(`pipeline: ${err.message}`);
    await sink.close();
    return baseReport('failed');
  }

  try {
    // --- Planner ---
    emitPipeline({ stage: 'planner', status: 'start' });
    try {
      scenarioPlan = await withStageTiming('planner', () => deps.planner.plan(config));
      writeFileSync(workdir.scenariosJson, JSON.stringify(scenarioPlan, null, 2), 'utf8');
      emitPipeline({ stage: 'planner', status: 'done', detail: `${scenarioPlan.scenes.length} scènes` });
    } catch (err) {
      const message = err instanceof AdaError ? err.message : (err as Error).message;
      errors.push(`planner: ${message}`);
      emitPipeline({ stage: 'planner', status: 'error', detail: message });
      return baseReport('failed');
    }

    if (options.dryRun) {
      return baseReport('partial');
    }

    if (aborted()) {
      errors.push('interrupted by user');
      return baseReport('partial');
    }

    // --- Navigator ---
    await withStageTiming('navigator', async () => {
      try {
        await deps.navigator.open();

        if (config.auth && config.auth.type !== 'none') {
          authReport = await deps.navigator.authenticate(config, workdir);
          if (authReport && !authReport.success) {
            errors.push(`auth: ${authReport.error ?? 'unknown failure'}`);
            return;
          }
        }

        for (const scene of scenarioPlan!.scenes) {
          if (aborted()) {
            errors.push('interrupted by user');
            break;
          }
          emitPipeline({ stage: 'navigator', status: 'start', sceneId: scene.id });
          try {
            const trace = await deps.navigator.execute(config, scene, workdir);
            traces.push(trace);
            emitPipeline({
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
            emitPipeline({ stage: 'navigator', status: 'error', sceneId: scene.id, detail: message });
          }
        }
      } finally {
        await deps.navigator.close();
      }
    });

    if (aborted()) {
      return baseReport('partial');
    }

    if (authReport && !authReport.success) {
      return baseReport('failed');
    }

    const successfulTraces = traces.filter((t) => t.success);
    if (successfulTraces.length === 0) {
      return baseReport('failed');
    }

    // --- Scripter ---
    emitPipeline({ stage: 'scripter', status: 'start' });
    try {
      script = await withStageTiming('scripter', () =>
        deps.scripter.generate(config, successfulTraces),
      );
      writeFileSync(workdir.scriptJson, JSON.stringify(script, null, 2), 'utf8');
      emitPipeline({ stage: 'scripter', status: 'done', detail: `${script.segments.length} segments` });
    } catch (err) {
      const message = err instanceof AdaError ? err.message : (err as Error).message;
      errors.push(`scripter: ${message}`);
      emitPipeline({ stage: 'scripter', status: 'error', detail: message });
      return baseReport('partial');
    }

    if (aborted()) return baseReport('partial');

    // --- Voicer ---
    emitPipeline({ stage: 'voicer', status: 'start' });
    try {
      audio = await withStageTiming('voicer', () => deps.voicer.synthesize(config, script!, workdir));
      emitPipeline({ stage: 'voicer', status: 'done', detail: `${audio.length} segments audio` });
    } catch (err) {
      const message = err instanceof AdaError ? err.message : (err as Error).message;
      errors.push(`voicer: ${message}`);
      emitPipeline({ stage: 'voicer', status: 'error', detail: message });
      return baseReport('partial');
    }

    if (aborted()) return baseReport('partial');

    // --- Composer ---
    emitPipeline({ stage: 'composer', status: 'start' });
    try {
      const composition = await withStageTiming('composer', async () => {
        const comp = await deps.composer.compose(config, script!, audio, successfulTraces, workdir);
        outputPath = await deps.composer.render(config, comp, workdir);
        return comp;
      });
      void composition;
      emitPipeline({
        stage: 'composer',
        status: 'done',
        ...(outputPath !== undefined ? { detail: outputPath } : {}),
      });
    } catch (err) {
      const message = err instanceof AdaError ? err.message : (err as Error).message;
      errors.push(`composer: ${message}`);
      emitPipeline({ stage: 'composer', status: 'error', detail: message });
      return baseReport('partial');
    }

    return baseReport('success');
  } finally {
    await sink.close();
  }
}

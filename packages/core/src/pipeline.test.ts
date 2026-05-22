import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { z } from 'zod';

import { runPipeline } from './pipeline.js';
import { createPlanner, type PlannerTextProvider } from './modules/planner.js';
import { createScripter, type ScripterTextProvider } from './modules/scripter.js';
import { createVoicer, type VoicerProvider } from './modules/voicer.js';
import { createComposer } from './modules/composer.js';
import type { Navigator } from './modules/navigator.js';
import type { AdaTemplate } from './template.js';
import type {
  AgentAction,
  NavigationTrace,
  RunConfig,
  Scene,
  TemplateName,
} from './types.js';
import type { Workdir } from './workdir.js';

function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ada-pipe-'));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function fakeNavigator(): Navigator {
  return {
    async open() {},
    async authenticate() {
      return undefined;
    },
    async execute(_config: RunConfig, scene: Scene, workdir: Workdir): Promise<NavigationTrace> {
      const action: AgentAction = {
        type: 'left_click',
        coordinate: [100, 200],
        reasoning: 'inline mock click',
        timestamp: new Date().toISOString(),
      };
      const trace: NavigationTrace = {
        sceneId: scene.id,
        actions: [action],
        capturePath: '',
        durationSec: 5,
        success: true,
      };
      writeFileSync(workdir.traceJson(scene.id), JSON.stringify(trace, null, 2), 'utf8');
      return trace;
    },
    async close() {},
  };
}

// Inline mock text provider — no network, returns fixtures keyed by prompt hints.
function inlineTextProvider(): PlannerTextProvider & ScripterTextProvider {
  return {
    name: 'inline-mock-text',
    async completeStructured<T>(input: {
      system?: string;
      prompt: string;
      schema: z.ZodType<T>;
    }): Promise<T> {
      const isScript = input.prompt.includes('Script JSON');
      const candidate = isScript
        ? {
            language: 'fr',
            segments: [
              {
                id: 'seg-home-1',
                sceneId: 'home',
                text: 'Mock segment 1.',
                startSec: 0,
                estimatedDurationSec: 3,
              },
            ],
          }
        : {
            generatedAt: new Date().toISOString(),
            language: 'fr',
            scenes: [
              {
                id: 'home',
                objective: 'mock home',
                preconditions: [],
                estimatedDurationSec: 20,
                successCriteria: '/',
              },
            ],
          };
      return input.schema.parse(candidate);
    },
  };
}

// Inline mock TTS provider — silent 2s MPEG-1 layer 3 stream.
function inlineTtsProvider(): VoicerProvider {
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const body = Buffer.alloc(413, 0);
  const frame = Buffer.concat([header, body]);
  const silentMp3 = Buffer.concat(Array.from({ length: 77 }, () => frame));
  return {
    name: 'inline-mock-tts',
    async synthesize() {
      return { audio: silentMp3, durationSec: 2.0 };
    },
  };
}

function trivialTemplate(): AdaTemplate {
  return {
    name: 'classic' as TemplateName,
    render({ compositionId, script }) {
      return {
        html: `<!doctype html><div id="stage" data-composition-id="${compositionId}">${script.segments
          .map((s) => `<p>${s.text}</p>`)
          .join('')}</div>`,
        durationSec: script.segments.reduce((acc, s) => acc + s.estimatedDurationSec, 0),
      };
    },
  };
}

const baseConfig: RunConfig = {
  project: {
    name: 'IntegrationTest',
    url: 'https://example.com',
    language: 'fr',
  },
  output: {
    format: 'mp4',
    resolution: '1080p',
    ratio: '16:9',
    template: 'classic',
    path: './should-be-overridden.mp4',
  },
  providers: {
    vision: 'mock-vision',
    text: 'mock-text',
    tts: 'mock-tts',
  },
};

describe('runPipeline (integration with mocks)', () => {
  it('runs end-to-end and produces a RunReport with composition.html + subtitles', async () => {
    await withTempDir(async (baseDir) => {
      const fakeMp4 = join(baseDir, 'demo-fake.mp4');
      const textProvider = inlineTextProvider();

      const deps = {
        planner: createPlanner({ provider: textProvider }),
        navigator: fakeNavigator(),
        scripter: createScripter({ provider: textProvider }),
        voicer: createVoicer({
          provider: inlineTtsProvider(),
          cacheDir: join(baseDir, 'cache'),
        }),
        composer: createComposer({
          resolveTemplate: () => trivialTemplate(),
          renderOverride: async () => {
            writeFileSync(fakeMp4, Buffer.from([0x00, 0x00, 0x00, 0x18]));
            return fakeMp4;
          },
        }),
      };

      const report = await runPipeline(
        { ...baseConfig, output: { ...baseConfig.output, path: fakeMp4 } },
        deps,
        { baseDir },
      );

      assert.equal(report.status, 'success', `errors: ${report.errors.join(' | ')}`);
      assert.equal(report.outputPath, fakeMp4);
      assert.ok(report.scenes.length >= 1);
      assert.ok(report.subtitlesPath, 'subtitlesPath missing');
      assert.ok(existsSync(report.subtitlesPath!.srt));
      assert.ok(existsSync(report.subtitlesPath!.vtt));
      assert.ok(existsSync(report.transcriptPath!));

      // composition.html should be next to the assets
      const runId = report.subtitlesPath!.srt.split(/[\\/]/).at(-2);
      const compositionHtml = join(baseDir, runId!, 'composition', 'composition.html');
      assert.ok(existsSync(compositionHtml), `composition.html missing at ${compositionHtml}`);
      const html = readFileSync(compositionHtml, 'utf8');
      assert.match(html, /data-composition-id/);
    });
  });

  it('returns failed status if planner throws', async () => {
    await withTempDir(async (baseDir) => {
      const textProvider = inlineTextProvider();
      const deps = {
        planner: {
          async plan() {
            throw new Error('planner exploded');
          },
        },
        navigator: fakeNavigator(),
        scripter: createScripter({ provider: textProvider }),
        voicer: createVoicer({
          provider: inlineTtsProvider(),
          cacheDir: join(baseDir, 'cache'),
        }),
        composer: createComposer({
          resolveTemplate: () => trivialTemplate(),
          renderOverride: async () => 'unused',
        }),
      };

      const report = await runPipeline(baseConfig, deps, { baseDir });
      assert.equal(report.status, 'failed');
      assert.ok(report.errors.some((e) => e.includes('planner')));
    });
  });

  it('respects dryRun and exits after planner', async () => {
    await withTempDir(async (baseDir) => {
      const textProvider = inlineTextProvider();
      const deps = {
        planner: createPlanner({ provider: textProvider }),
        navigator: fakeNavigator(),
        scripter: createScripter({ provider: textProvider }),
        voicer: createVoicer({
          provider: inlineTtsProvider(),
          cacheDir: join(baseDir, 'cache'),
        }),
        composer: createComposer({
          resolveTemplate: () => trivialTemplate(),
          renderOverride: async () => 'never-called',
        }),
      };

      const report = await runPipeline(baseConfig, deps, { baseDir, dryRun: true });
      assert.equal(report.status, 'partial');
      assert.equal(report.outputPath, undefined);
    });
  });
});

import { appendFileSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { execa, ExecaError } from 'execa';
import { ModuleError } from '../errors.js';
import type { AdaTemplate } from '../template.js';
import type {
  AudioSegment,
  Composition,
  NavigationTrace,
  RunConfig,
  Script,
  TemplateName,
} from '../types.js';
import type { Workdir } from '../workdir.js';
import { scriptToSrt, scriptToTranscriptMarkdown, scriptToVtt } from '../srt.js';

export interface Composer {
  compose(
    config: RunConfig,
    script: Script,
    audio: AudioSegment[],
    traces: NavigationTrace[],
    workdir: Workdir,
  ): Promise<Composition>;
  render(config: RunConfig, composition: Composition, workdir: Workdir): Promise<string>;
}

export interface ComposerOptions {
  resolveTemplate(name: TemplateName): AdaTemplate;
  /**
   * Override the actual `npx hyperframes render` shell-out. When supplied,
   * `render()` returns whatever this function resolves to. Used by tests to
   * skip the heavy FFmpeg step while still exercising compose().
   */
  renderOverride?: (
    config: RunConfig,
    composition: Composition,
    workdir: Workdir,
  ) => Promise<string>;
}

function recalibrate(script: Script, audio: AudioSegment[]): Script {
  const byId = new Map(audio.map((a) => [a.segmentId, a.durationSec]));
  let cursor = 0;
  return {
    language: script.language,
    segments: script.segments.map((seg) => {
      const realDuration = byId.get(seg.id) ?? seg.estimatedDurationSec;
      const rebuilt = { ...seg, startSec: cursor, estimatedDurationSec: realDuration };
      cursor += realDuration;
      return rebuilt;
    }),
  };
}

const RESOLUTION: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
};

export function createComposer(options: ComposerOptions): Composer {
  return {
    async compose(config, script, audio, traces, workdir) {
      const template = options.resolveTemplate(config.output.template);
      const recalibrated = recalibrate(script, audio);
      const dims = RESOLUTION[config.output.resolution] ?? RESOLUTION['1080p']!;

      const placedAudio = audio.map((a) => {
        const target = resolve(workdir.assetsDir, `${a.segmentId}.mp3`);
        if (existsSync(a.path)) copyFileSync(a.path, target);
        return { ...a, path: relative(workdir.compositionDir, target).replaceAll('\\', '/') };
      });
      const placedTraces = traces.map((trace) => {
        if (!trace.capturePath || !existsSync(trace.capturePath)) return trace;
        const target = resolve(workdir.assetsDir, basename(trace.capturePath));
        copyFileSync(trace.capturePath, target);
        return {
          ...trace,
          capturePath: relative(workdir.compositionDir, target).replaceAll('\\', '/'),
        };
      });

      const { html, durationSec } = template.render({
        compositionId: `ada-${workdir.id}`,
        script: recalibrated,
        audio: placedAudio,
        traces: placedTraces,
        ratio: config.output.ratio,
        width: dims.width,
        height: dims.height,
      });

      writeFileSync(workdir.compositionHtml, html, 'utf8');
      writeFileSync(workdir.subtitlesSrt, scriptToSrt(recalibrated), 'utf8');
      writeFileSync(workdir.subtitlesVtt, scriptToVtt(recalibrated), 'utf8');
      writeFileSync(
        workdir.transcriptMd,
        scriptToTranscriptMarkdown(recalibrated, config.project.name),
        'utf8',
      );

      return {
        htmlPath: workdir.compositionHtml,
        assetsDir: workdir.assetsDir,
        durationSec,
        template: config.output.template,
      };
    },

    async render(config, composition, workdir) {
      if (options.renderOverride) {
        return options.renderOverride(config, composition, workdir);
      }
      const outputPath = resolve(config.output.path);
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

      try {
        const lintResult = await execa(npxCmd, ['hyperframes', 'lint', workdir.compositionDir], {
          reject: false,
          all: true,
        });
        writeFileSync(workdir.renderLog, `--- lint ---\n${lintResult.all ?? ''}\n`, 'utf8');
        if (lintResult.failed) {
          throw new ModuleError(
            'Composer',
            `npx hyperframes lint failed:\n${lintResult.all ?? ''}\n` +
              `Hint: ensure "hyperframes" is installed (npm i -D hyperframes) and Node 22+ is active.`,
          );
        }

        const renderResult = await execa(
          npxCmd,
          ['hyperframes', 'render', workdir.compositionDir, '--output', outputPath],
          { reject: false, all: true },
        );
        appendFileSync(
          workdir.renderLog,
          `\n--- render ---\n${renderResult.all ?? ''}\n`,
          'utf8',
        );
        if (renderResult.failed) {
          throw new ModuleError(
            'Composer',
            `npx hyperframes render failed:\n${renderResult.all ?? ''}`,
          );
        }
        if (!existsSync(outputPath)) {
          throw new ModuleError(
            'Composer',
            `hyperframes render terminé sans erreur mais ${outputPath} introuvable.`,
          );
        }
        void composition;
        return outputPath;
      } catch (err: unknown) {
        if (err instanceof ModuleError) throw err;
        if (err instanceof ExecaError && (err as { code?: string }).code === 'ENOENT') {
          throw new ModuleError(
            'Composer',
            'npx introuvable. Vérifiez que Node 22+ est installé et accessible dans le PATH.',
          );
        }
        throw new ModuleError('Composer', (err as Error).message);
      }
    },
  };
}

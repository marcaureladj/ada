import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nanoid } from 'nanoid';

export interface Workdir {
  readonly id: string;
  readonly root: string;
  readonly scenariosJson: string;
  readonly tracesDir: string;
  readonly screenshotsDir: string;
  readonly scriptJson: string;
  readonly audioDir: string;
  readonly compositionDir: string;
  readonly compositionHtml: string;
  readonly assetsDir: string;
  readonly subtitlesSrt: string;
  readonly subtitlesVtt: string;
  readonly transcriptMd: string;
  readonly reportJson: string;
  readonly renderLog: string;
  readonly captureWebm: string;
  readonly authStatePath: string;
  readonly auditLogPath: string;

  sceneDir(sceneId: string): string;
  screenshotPath(sceneId: string, step: number, kind: 'before' | 'after'): string;
  audioPath(segmentId: string): string;
  traceJson(sceneId: string): string;
}

export function createWorkdir(baseDir = './out'): Workdir {
  const id = nanoid(10);
  const root = resolve(baseDir, id);

  const tracesDir = join(root, 'traces');
  const screenshotsDir = join(root, 'screenshots');
  const audioDir = join(root, 'audio');
  const compositionDir = join(root, 'composition');
  const assetsDir = join(compositionDir, 'assets');

  mkdirSync(root, { recursive: true });
  mkdirSync(tracesDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  mkdirSync(compositionDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  return {
    id,
    root,
    scenariosJson: join(root, 'scenarios.json'),
    tracesDir,
    screenshotsDir,
    scriptJson: join(root, 'script.json'),
    audioDir,
    compositionDir,
    compositionHtml: join(compositionDir, 'composition.html'),
    assetsDir,
    subtitlesSrt: join(root, 'subtitles.srt'),
    subtitlesVtt: join(root, 'subtitles.vtt'),
    transcriptMd: join(root, 'transcript.md'),
    reportJson: join(root, 'report.json'),
    renderLog: join(root, 'render.log'),
    captureWebm: join(tracesDir, 'capture.webm'),
    authStatePath: join(root, 'auth-state.json'),
    auditLogPath: join(root, 'audit.log'),
    sceneDir(sceneId: string) {
      const dir = join(screenshotsDir, sceneId);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    screenshotPath(sceneId: string, step: number, kind: 'before' | 'after') {
      return join(this.sceneDir(sceneId), `${String(step).padStart(3, '0')}-${kind}.png`);
    },
    audioPath(segmentId: string) {
      return join(audioDir, `${segmentId}.mp3`);
    },
    traceJson(sceneId: string) {
      return join(tracesDir, `${sceneId}.json`);
    },
  };
}

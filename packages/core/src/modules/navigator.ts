import { writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ModuleError } from '../errors.js';
import type {
  AgentAction,
  AuthReport,
  NavigationTrace,
  RunConfig,
  Scene,
} from '../types.js';
import type { Workdir } from '../workdir.js';
import { translateKey } from './key-translate.js';
import type { AuthModule } from './auth.js';
import type { ScreenshotRedactor } from './screenshot-redactor.js';

export interface ComputerActionContext {
  screenshotAfter: Buffer;
  url: string;
}

export interface VisionRunInput {
  initialScreenshot: Buffer;
  url: string;
  goal: string;
  viewportWidth: number;
  viewportHeight: number;
  maxIterations: number;
  executeAction: (action: AgentAction) => Promise<ComputerActionContext>;
  onStep?: (
    action: AgentAction,
    screenshotBefore: Buffer,
    screenshotAfter: Buffer,
  ) => void;
}

export interface VisionRunResult {
  actions: AgentAction[];
  success: boolean;
  reasoning: string;
  error?: string;
}

export interface NavigatorVisionProvider {
  readonly name: string;
  runComputerLoop(input: VisionRunInput): Promise<VisionRunResult>;
}

export interface Navigator {
  open(): Promise<void>;
  authenticate(config: RunConfig, workdir: Workdir): Promise<AuthReport | undefined>;
  execute(config: RunConfig, scene: Scene, workdir: Workdir): Promise<NavigationTrace>;
  close(): Promise<void>;
}

export interface NavigatorOptions {
  provider: NavigatorVisionProvider;
  authModule?: AuthModule;
  redactor?: ScreenshotRedactor;
  maxIterations?: number;
  sceneTimeoutMs?: number;
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

const SCROLL_PIXELS_PER_AMOUNT = 100;

async function runPlaywrightAction(page: Page, action: AgentAction): Promise<void> {
  switch (action.type) {
    case 'left_click': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.click(x, y);
      break;
    }
    case 'right_click': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.click(x, y, { button: 'right' });
      break;
    }
    case 'middle_click': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.click(x, y, { button: 'middle' });
      break;
    }
    case 'double_click': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.dblclick(x, y);
      break;
    }
    case 'triple_click': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.click(x, y, { clickCount: 3 });
      break;
    }
    case 'type': {
      if (action.text === undefined) throw new Error('type sans text');
      await page.keyboard.type(action.text);
      break;
    }
    case 'key': {
      if (action.text === undefined) throw new Error('key sans text');
      await page.keyboard.press(translateKey(action.text));
      break;
    }
    case 'mouse_move': {
      const [x, y] = action.coordinate ?? [0, 0];
      await page.mouse.move(x, y);
      break;
    }
    case 'left_click_drag': {
      const [x1, y1] = action.coordinate ?? [0, 0];
      const [x2, y2] = action.coordinateEnd ?? action.coordinate ?? [0, 0];
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 10 });
      await page.mouse.up();
      break;
    }
    case 'scroll': {
      const amount = (action.scrollAmount ?? 3) * SCROLL_PIXELS_PER_AMOUNT;
      const direction = action.scrollDirection ?? 'down';
      const [dx, dy] =
        direction === 'down'
          ? [0, amount]
          : direction === 'up'
            ? [0, -amount]
            : direction === 'right'
              ? [amount, 0]
              : [-amount, 0];
      if (action.coordinate) {
        const [cx, cy] = action.coordinate;
        await page.mouse.move(cx, cy);
      }
      await page.mouse.wheel(dx, dy);
      break;
    }
    case 'wait': {
      const ms = Math.min(15_000, Math.max(50, (action.duration ?? 1) * 1000));
      await page.waitForTimeout(ms);
      break;
    }
    case 'screenshot':
    case 'cursor_position':
    case 'done': {
      // No-op; the surrounding loop captures a fresh screenshot after each action.
      break;
    }
  }
}

export function createNavigator(options: NavigatorOptions): Navigator {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const viewportWidth = options.viewportWidth ?? 1280;
  const viewportHeight = options.viewportHeight ?? 800;

  // Capture-or-redact: prefer the redactor when configured so screenshots sent
  // to the vision provider never carry password fields, API key inputs, etc.
  const captureScreenshot = async (p: Page, fullPage = false): Promise<Buffer> => {
    if (options.redactor) {
      return options.redactor.capture(p, { fullPage });
    }
    return p.screenshot({ fullPage });
  };

  return {
    async open() {
      const headless = options.headless ?? process.env['ADA_HEADLESS'] === 'true';
      browser = await chromium.launch({ headless });
      context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        deviceScaleFactor: 1,
        recordVideo: { dir: '.ada-cache/recordings', size: { width: viewportWidth, height: viewportHeight } },
      });
      page = await context.newPage();
    },

    async authenticate(config, workdir) {
      if (!page || !context) {
        throw new ModuleError('Navigator', 'navigateur non ouvert (appelez open() d\'abord)');
      }
      if (!config.auth || config.auth.type === 'none') return undefined;
      if (!options.authModule) {
        // Auth requested but no module wired → fail loudly.
        return {
          success: false,
          type: config.auth.type,
          durationSec: 0,
          auditLog: ['authModule absent du Navigator'],
          error: 'authModule non configuré',
        };
      }
      try {
        await page.goto(config.project.url, { waitUntil: 'networkidle', timeout: 30_000 });
      } catch (err) {
        return {
          success: false,
          type: config.auth.type,
          durationSec: 0,
          auditLog: [`navigation auth a échoué: ${(err as Error).message}`],
          error: (err as Error).message,
        };
      }
      return options.authModule.execute({ page, context, auth: config.auth, workdir });
    },

    async execute(config, scene, workdir) {
      if (!page || !context) {
        throw new ModuleError('Navigator', 'navigateur non ouvert (appelez open() d\'abord)');
      }
      const start = Date.now();
      const sceneTimeoutMs = options.sceneTimeoutMs ?? 5 * 60_000;
      const maxIterations = options.maxIterations ?? 30;

      try {
        await page.goto(config.project.url, { waitUntil: 'networkidle', timeout: 30_000 });
      } catch (err) {
        return {
          sceneId: scene.id,
          actions: [],
          capturePath: '',
          durationSec: (Date.now() - start) / 1000,
          success: false,
          error: `navigation initiale a échoué : ${(err as Error).message}`,
        };
      }

      const initialScreenshot = await captureScreenshot(page);
      let stepIndex = 0;

      const executeAction = async (action: AgentAction): Promise<ComputerActionContext> => {
        if (!page) throw new Error('page indisponible');
        if (Date.now() - start > sceneTimeoutMs) {
          throw new Error('timeout scène atteint');
        }
        await runPlaywrightAction(page, action);
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        const screenshotAfter = await captureScreenshot(page);
        return { screenshotAfter, url: page.url() };
      };

      const onStep = (action: AgentAction, before: Buffer, after: Buffer): void => {
        const beforePath = workdir.screenshotPath(scene.id, stepIndex, 'before');
        const afterPath = workdir.screenshotPath(scene.id, stepIndex, 'after');
        writeFileSync(beforePath, before);
        writeFileSync(afterPath, after);
        action.screenshotBefore = beforePath;
        action.screenshotAfter = afterPath;
        stepIndex += 1;
      };

      const result = await options.provider.runComputerLoop({
        initialScreenshot,
        url: page.url(),
        goal: `${scene.objective}\nCritère de succès : ${scene.successCriteria}`,
        viewportWidth,
        viewportHeight,
        maxIterations,
        executeAction,
        onStep,
      });

      const video = page.video();
      const capturePath = video ? await video.path().catch(() => undefined) : undefined;

      const trace: NavigationTrace = {
        sceneId: scene.id,
        actions: result.actions,
        capturePath: capturePath ?? '',
        durationSec: (Date.now() - start) / 1000,
        success: result.success,
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
      writeFileSync(workdir.traceJson(scene.id), JSON.stringify(trace, null, 2), 'utf8');
      return trace;
    },

    async close() {
      try {
        if (context) await context.close();
      } catch {
        // ignore
      }
      try {
        if (browser) await browser.close();
      } catch {
        // ignore
      }
      page = null;
      context = null;
      browser = null;
    },
  };
}

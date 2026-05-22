import {
  ModuleError,
  agentActionInputSchema,
  withRetry,
  type AgentAction,
} from '@ada/core';
import { tryParseStructured } from '../text/structured.js';
import type {
  ComputerActionContext,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export interface ScreenshotJsonCallInput {
  system: string;
  userText: string;
  screenshotPng: Buffer;
}

export interface ScreenshotJsonCallResult {
  rawText: string;
}

export interface ScreenshotJsonProviderConfig {
  name: string;
  callVision: (input: ScreenshotJsonCallInput) => Promise<ScreenshotJsonCallResult>;
}

const SYSTEM_PROMPT = `Tu pilotes un navigateur web. À chaque tour, tu reçois un screenshot et un objectif.
Tu réponds avec UNE SEULE action JSON conforme :

{
  "type": "left_click" | "right_click" | "double_click" | "triple_click" | "type" | "key" | "mouse_move" | "scroll" | "wait" | "screenshot" | "done",
  "selector": "<sélecteur CSS stable, préféré au coordinate>",
  "coordinate": [x, y],
  "text": "<texte si type=type, combo si type=key>",
  "scrollDirection": "up" | "down" | "left" | "right",
  "scrollAmount": <nombre, default 3>,
  "duration": <secondes si type=wait>,
  "reasoning": "<courte explication en français>"
}

Règles strictes :
- Préfère TOUJOURS un selector CSS (id, data-*, aria-label) plutôt que coordinate.
- Pour cliquer dans un input puis taper : 2 actions séparées (left_click puis type).
- Si l'objectif est atteint, réponds { "type": "done", "reasoning": "..." }.
- Réponds UNIQUEMENT avec l'objet JSON, sans markdown, sans préambule.`;

function summarizeHistory(history: AgentAction[]): string {
  if (history.length === 0) return '(aucune action précédente)';
  return history
    .slice(-8)
    .map((a, i) => {
      const target = a.selector ? a.selector : a.coordinate ? `(${a.coordinate.join(',')})` : '';
      const value = a.text ? ` "${a.text}"` : '';
      return `${i + 1}. ${a.type} ${target}${value} — ${a.reasoning}`;
    })
    .join('\n');
}

export async function runScreenshotJsonLoop(
  input: VisionRunInput,
  config: ScreenshotJsonProviderConfig,
  providerConfig: VisionProviderConfig,
): Promise<VisionRunResult> {
  const actions: AgentAction[] = [];
  let lastReasoning = '';
  let currentScreenshot = input.initialScreenshot;
  let currentUrl = input.url;
  const sink = providerConfig.eventSink;
  const maxRetries = providerConfig.maxRetries ?? 1;

  for (let iteration = 0; iteration < input.maxIterations; iteration++) {
    const userText = `URL courante : ${currentUrl}
Objectif de la scène : ${input.goal}
Viewport : ${input.viewportWidth}x${input.viewportHeight} px.

Historique récent :
${summarizeHistory(actions)}

Quelle est la prochaine action à exécuter ?`;

    let attempt = 0;
    let parsed: AgentAction | undefined;
    let lastFeedback = '';

    while (attempt <= maxRetries) {
      const { result, stats } = await withRetry(
        async () => {
          const promptedUserText = lastFeedback
            ? `${userText}\n\nCORRECTION: ${lastFeedback}`
            : userText;
          return config.callVision({
            system: SYSTEM_PROMPT,
            userText: promptedUserText,
            screenshotPng: currentScreenshot,
          });
        },
        {
          maxAttempts: 3,
          onAttempt: (att, error, delayMs) => {
            sink?.emit({
              level: 'warn',
              type: `api.${config.name}.retry`,
              payload: {
                attempt: att,
                delayMs,
                error: (error as Error)?.message ?? String(error),
              },
            });
          },
        },
      );
      sink?.emit({
        level: 'debug',
        type: `api.${config.name}.call`,
        payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
      });

      const parseResult = tryParseStructured(agentActionInputSchema, result.rawText);
      if (parseResult.ok) {
        parsed = {
          ...parseResult.data,
          timestamp: new Date().toISOString(),
        } as AgentAction;
        break;
      }
      lastFeedback = parseResult.feedback;
      attempt += 1;
    }

    if (!parsed) {
      return {
        actions,
        success: false,
        reasoning: lastReasoning,
        error: `parse failed after ${maxRetries + 1} attempts: ${lastFeedback}`,
      };
    }

    if (parsed.reasoning) lastReasoning = parsed.reasoning;
    if (parsed.type === 'done') {
      return { actions, success: true, reasoning: lastReasoning };
    }

    const before = currentScreenshot;
    let ctx: ComputerActionContext | undefined;
    let execError: string | undefined;
    try {
      ctx = await input.executeAction(parsed);
      currentScreenshot = ctx.screenshotAfter;
      currentUrl = ctx.url;
    } catch (err) {
      execError = (err as Error).message;
      parsed.reasoning = `${parsed.reasoning} [ÉCHEC: ${execError}]`;
    }

    actions.push(parsed);
    if (input.onStep && ctx) {
      input.onStep(parsed, before, ctx.screenshotAfter);
    }

    if (execError) {
      // Surface error to the model on next iteration via lastReasoning.
      lastReasoning = `${lastReasoning} [error: ${execError}]`;
    }
  }

  return {
    actions,
    success: false,
    reasoning: lastReasoning,
    error: `maxIterations (${input.maxIterations}) reached without 'done' response.`,
  };
}

export function transientCallError(): typeof ModuleError {
  return ModuleError;
}

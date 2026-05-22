import Anthropic from '@anthropic-ai/sdk';
import {
  ModuleError,
  type AgentAction,
  type AgentActionType,
  type ScrollDirection,
} from '@ada/core';
import type {
  ComputerActionContext,
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_BETA = 'computer-use-2025-01-24';
const DEFAULT_TOOL_TYPE = 'computer_20250124';

const SYSTEM_PROMPT = `Tu pilotes un navigateur via l'outil 'computer'.
Tu reçois un objectif et l'état courant de l'écran sous forme de screenshot.
À chaque tour, tu peux appeler l'outil 'computer' pour interagir (click, type, scroll, key, etc.) ou répondre en texte pour conclure.

Règles :
- Privilégie 'screenshot' uniquement quand tu as un doute sur l'état courant — le client te renvoie un screenshot après chaque action.
- Pour les zones de saisie : clique d'abord pour focus, puis 'type'.
- Si tu juges l'objectif atteint, réponds en texte SANS appeler l'outil — la boucle s'arrête.
- Si une action échoue (tool_result.is_error=true), analyse l'écran avant de relancer la même action.`;

function makeClient(config: VisionProviderConfig): Anthropic {
  const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new ModuleError(
      'VisionProvider:claude',
      'ANTHROPIC_API_KEY manquant. Définissez-le dans votre .env.',
    );
  }
  return new Anthropic({ apiKey });
}

function lazyClient(config: VisionProviderConfig): () => Anthropic {
  let cached: Anthropic | undefined;
  return () => (cached ??= makeClient(config));
}

// Computer Use returns actions as snake_case strings; map them to our AgentActionType.
// Unknown action names are mapped to 'screenshot' (no-op) with a warning in reasoning.
const ACTION_TYPE_MAP: Record<string, AgentActionType> = {
  left_click: 'left_click',
  right_click: 'right_click',
  middle_click: 'middle_click',
  double_click: 'double_click',
  triple_click: 'triple_click',
  type: 'type',
  key: 'key',
  mouse_move: 'mouse_move',
  left_click_drag: 'left_click_drag',
  scroll: 'scroll',
  wait: 'wait',
  screenshot: 'screenshot',
  cursor_position: 'cursor_position',
};

function coercePair(value: unknown): [number, number] | undefined {
  if (Array.isArray(value) && value.length === 2) {
    const [x, y] = value as [unknown, unknown];
    if (typeof x === 'number' && typeof y === 'number') return [x, y];
  }
  return undefined;
}

function parseScrollDirection(raw: unknown): ScrollDirection | undefined {
  if (raw === 'up' || raw === 'down' || raw === 'left' || raw === 'right') return raw;
  return undefined;
}

interface ParsedToolUse {
  id: string;
  action: AgentAction;
}

function parseToolUse(
  block: Anthropic.Messages.ToolUseBlock,
  reasoning: string,
): ParsedToolUse | null {
  if (block.name !== 'computer') return null;
  const input = block.input as Record<string, unknown>;
  const rawAction = String(input['action'] ?? '');
  const mapped = ACTION_TYPE_MAP[rawAction];
  if (!mapped) {
    return {
      id: block.id,
      action: {
        type: 'screenshot',
        reasoning: `${reasoning}\n[ADA: action inconnue "${rawAction}", ignorée]`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const coordinate = coercePair(input['coordinate']);
  const coordinateEnd = coercePair(input['coordinate_end'] ?? input['end_coordinate']);
  const text = input['text'] === undefined ? undefined : String(input['text']);
  const duration =
    typeof input['duration'] === 'number' ? Math.max(0, input['duration'] as number) : undefined;
  const scrollAmount =
    typeof input['scroll_amount'] === 'number'
      ? Math.max(0, input['scroll_amount'] as number)
      : undefined;
  const scrollDirection = parseScrollDirection(input['scroll_direction']);

  const action: AgentAction = {
    type: mapped,
    reasoning,
    timestamp: new Date().toISOString(),
    ...(coordinate !== undefined ? { coordinate } : {}),
    ...(coordinateEnd !== undefined ? { coordinateEnd } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(scrollAmount !== undefined ? { scrollAmount } : {}),
    ...(scrollDirection !== undefined ? { scrollDirection } : {}),
  };
  return { id: block.id, action };
}

function extractReasoning(message: Anthropic.Messages.Message): string {
  const parts = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text.trim())
    .filter((t) => t.length > 0);
  return parts.join(' ');
}

function imageBlock(buffer: Buffer): Anthropic.Messages.ImageBlockParam {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: buffer.toString('base64'),
    },
  };
}

export function createClaudeComputerUseProvider(config: VisionProviderConfig): VisionProvider {
  const getClient = lazyClient(config);
  const model = config.model ?? process.env['ADA_VISION_MODEL'] ?? DEFAULT_MODEL;
  const beta = config.betaHeader ?? process.env['ADA_COMPUTER_USE_BETA'] ?? DEFAULT_BETA;

  return {
    name: 'claude-computer-use',
    async runComputerLoop(input: VisionRunInput): Promise<VisionRunResult> {
      const computerTool = {
        type: DEFAULT_TOOL_TYPE,
        name: 'computer',
        display_width_px: input.viewportWidth,
        display_height_px: input.viewportHeight,
      } as unknown as Anthropic.Messages.Tool;

      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Objectif : ${input.goal}\nURL courante : ${input.url}\nViewport : ${input.viewportWidth}x${input.viewportHeight} px.\n\nVoici le screenshot initial. Pilote le navigateur jusqu'à atteindre l'objectif.`,
            },
            imageBlock(input.initialScreenshot),
          ],
        },
      ];

      const actions: AgentAction[] = [];
      let lastReasoning = '';
      let currentScreenshot = input.initialScreenshot;
      let currentUrl = input.url;

      for (let iteration = 0; iteration < input.maxIterations; iteration++) {
        let response: Anthropic.Messages.Message;
        try {
          response = await getClient().messages.create(
            {
              model,
              max_tokens: 1500,
              system: SYSTEM_PROMPT,
              tools: [computerTool],
              messages,
            },
            { headers: { 'anthropic-beta': beta } },
          );
        } catch (err) {
          const message = (err as Error).message;
          if (message.includes('400') || message.toLowerCase().includes('beta')) {
            return {
              actions,
              success: false,
              reasoning: lastReasoning,
              error: `Anthropic a refusé la requête (${message}). Vérifiez ADA_COMPUTER_USE_BETA / ADA_VISION_MODEL.`,
            };
          }
          throw new ModuleError('VisionProvider:claude', message);
        }

        const reasoning = extractReasoning(response);
        if (reasoning) lastReasoning = reasoning;

        const toolUses = response.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
          return { actions, success: true, reasoning: lastReasoning };
        }

        // Persist the assistant turn before injecting tool_results.
        messages.push({ role: 'assistant', content: response.content });
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of toolUses) {
          const parsed = parseToolUse(block, reasoning);
          if (!parsed) continue;
          const { id, action } = parsed;

          const before = currentScreenshot;
          let resultContext: ComputerActionContext | undefined;
          let executionError: string | undefined;

          try {
            resultContext = await input.executeAction(action);
            currentScreenshot = resultContext.screenshotAfter;
            currentUrl = resultContext.url;
          } catch (err) {
            executionError = (err as Error).message;
          }

          actions.push(action);
          if (input.onStep && resultContext) {
            input.onStep(action, before, resultContext.screenshotAfter);
          }

          if (executionError) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: id,
              is_error: true,
              content: [
                { type: 'text', text: `Erreur Playwright : ${executionError}` },
                imageBlock(currentScreenshot),
              ],
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: id,
              content: [
                { type: 'text', text: `Action exécutée. URL courante : ${currentUrl}` },
                imageBlock(currentScreenshot),
              ],
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      }

      return {
        actions,
        success: false,
        reasoning: lastReasoning,
        error: `maxIterations (${input.maxIterations}) atteint sans conclusion de Claude.`,
      };
    },
  };
}

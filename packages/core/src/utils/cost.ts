// Coarse per-call cost estimate, used to fill RunReport.estimatedCostUsd.
// Numbers are May 2026 list prices; they will drift, but the magnitude is the
// useful information for users wondering "did this run cost cents or dollars?".

export type TextProviderName = 'claude' | 'openai';
export type TtsProviderName = 'elevenlabs' | 'openai';

export interface UsageDelta {
  textInputTokens?: number;
  textOutputTokens?: number;
  visionInputTokens?: number;
  visionOutputTokens?: number;
  ttsCharacters?: number;
  textProvider?: TextProviderName;
  ttsProvider?: TtsProviderName;
}

// USD per 1M tokens (input / output) for text models.
const TEXT_PRICING: Record<TextProviderName, { input: number; output: number }> = {
  claude: { input: 3.0, output: 15.0 },
  openai: { input: 2.5, output: 10.0 },
};

// USD per 1k characters for TTS.
const TTS_PRICING: Record<TtsProviderName, number> = {
  elevenlabs: 0.18,
  openai: 0.015,
};

function priceText(provider: TextProviderName, inputTokens: number, outputTokens: number): number {
  const p = TEXT_PRICING[provider];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function priceTts(provider: TtsProviderName, characters: number): number {
  return (characters / 1_000) * TTS_PRICING[provider];
}

export function estimateCostUsd(delta: UsageDelta): number {
  const textProvider = delta.textProvider ?? 'claude';
  const ttsProvider = delta.ttsProvider ?? 'elevenlabs';

  const textIn = (delta.textInputTokens ?? 0) + (delta.visionInputTokens ?? 0);
  const textOut = (delta.textOutputTokens ?? 0) + (delta.visionOutputTokens ?? 0);
  const llmCost = priceText(textProvider, textIn, textOut);
  const ttsCost = priceTts(ttsProvider, delta.ttsCharacters ?? 0);
  return Math.round((llmCost + ttsCost) * 10_000) / 10_000;
}

export class CostAccumulator {
  private acc = {
    textInputTokens: 0,
    textOutputTokens: 0,
    visionInputTokens: 0,
    visionOutputTokens: 0,
    ttsCharacters: 0,
  };
  private textProvider: TextProviderName = 'claude';
  private ttsProvider: TtsProviderName = 'elevenlabs';

  setProviders(text: TextProviderName, tts: TtsProviderName): void {
    this.textProvider = text;
    this.ttsProvider = tts;
  }

  add(delta: UsageDelta): void {
    this.acc.textInputTokens += delta.textInputTokens ?? 0;
    this.acc.textOutputTokens += delta.textOutputTokens ?? 0;
    this.acc.visionInputTokens += delta.visionInputTokens ?? 0;
    this.acc.visionOutputTokens += delta.visionOutputTokens ?? 0;
    this.acc.ttsCharacters += delta.ttsCharacters ?? 0;
    if (delta.textProvider) this.textProvider = delta.textProvider;
    if (delta.ttsProvider) this.ttsProvider = delta.ttsProvider;
  }

  snapshot(): UsageDelta & { estimatedCostUsd: number } {
    return {
      ...this.acc,
      textProvider: this.textProvider,
      ttsProvider: this.ttsProvider,
      estimatedCostUsd: estimateCostUsd({
        ...this.acc,
        textProvider: this.textProvider,
        ttsProvider: this.ttsProvider,
      }),
    };
  }
}

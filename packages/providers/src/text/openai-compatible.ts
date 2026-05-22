import { ModuleError } from '@ada/core';
import { createOpenAiTextProvider } from './openai.js';
import type { TextProvider, TextProviderConfig } from './index.js';

interface CompatibleSpec {
  name: string;
  envUrl: string;
  envKey: string;
  envModel: string;
  defaultModel: string;
  hint: string;
}

function buildCompatible(spec: CompatibleSpec) {
  return (config: TextProviderConfig): TextProvider => {
    const baseURL = config.baseURL ?? process.env[spec.envUrl];
    const apiKey = config.apiKey ?? process.env[spec.envKey];
    if (!baseURL) {
      throw new ModuleError(
        `TextProvider:${spec.name}`,
        `${spec.envUrl} manquant. Définissez l'URL de base ${spec.hint}.`,
      );
    }
    const model = config.model ?? process.env[spec.envModel] ?? spec.defaultModel;
    return createOpenAiTextProvider({
      ...config,
      baseURL,
      apiKey,
      model,
      nameOverride: spec.name,
    });
  };
}

export const createVertexTextProvider = buildCompatible({
  name: 'vertex',
  envUrl: 'ADA_VERTEX_API_URL',
  envKey: 'ADA_VERTEX_API_KEY',
  envModel: 'ADA_VERTEX_MODEL',
  defaultModel: 'google/gemini-2.5-pro',
  hint: '(Google Vertex AI, OpenAI-compatible endpoint)',
});

export const createFalTextProvider = buildCompatible({
  name: 'fal',
  envUrl: 'ADA_FAL_API_URL',
  envKey: 'ADA_FAL_API_KEY',
  envModel: 'ADA_FAL_MODEL',
  defaultModel: 'meta-llama/Llama-3.1-70B-Instruct',
  hint: '(fal.ai)',
});

export const createReplicateTextProvider = buildCompatible({
  name: 'replicate',
  envUrl: 'ADA_REPLICATE_API_URL',
  envKey: 'ADA_REPLICATE_API_KEY',
  envModel: 'ADA_REPLICATE_MODEL',
  defaultModel: 'meta/llama-3.1-405b-instruct',
  hint: '(Replicate openai-proxy)',
});

export const createGenericOpenAiCompatibleProvider = buildCompatible({
  name: 'openai-compat',
  envUrl: 'ADA_GENERIC_API_URL',
  envKey: 'ADA_GENERIC_API_KEY',
  envModel: 'ADA_GENERIC_MODEL',
  defaultModel: 'gpt-4o-mini',
  hint: '(any OpenAI-compatible endpoint: LM Studio, vLLM, OpenRouter, …)',
});

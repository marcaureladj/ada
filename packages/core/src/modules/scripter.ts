import type { z } from 'zod';
import { scriptSchema } from '../schema.js';
import type { NavigationTrace, RunConfig, Script } from '../types.js';

export interface ScripterTextProvider {
  readonly name: string;
  completeStructured<T>(input: {
    system?: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T>;
}

export interface Scripter {
  generate(config: RunConfig, traces: NavigationTrace[]): Promise<Script>;
}

const SYSTEM_PROMPT = `Tu es l'auteur d'un script narratif pour une vidéo de documentation produit.
Tu reçois la séquence d'actions réalisées par un agent IA dans un navigateur, sous forme de NavigationTrace.
Tu produis un Script découpé en segments, chacun correspondant à une action visuelle significative.

Règles :
- Ton pédagogique, naturel, sans jargon excessif.
- Ne mentionne JAMAIS qu'une IA parle ou pilote l'écran.
- Vocabulaire produit cohérent, terminologie alignée sur la langue cible.
- Estime la durée de chaque segment à partir du nombre de mots :
  - français : 150 mots/min → durée_sec ≈ nb_mots * 0.4
  - anglais  : 165 mots/min → durée_sec ≈ nb_mots * 0.36
- Les startSec sont cumulatifs : startSec(n) = startSec(n-1) + estimatedDurationSec(n-1).
- L'identifiant de segment a la forme "seg-<scene>-<n>".`;

function formatActionDetail(a: NavigationTrace['actions'][number]): string {
  const parts: string[] = [];
  if (a.coordinate) parts.push(`@(${a.coordinate[0]},${a.coordinate[1]})`);
  if (a.coordinateEnd) parts.push(`→(${a.coordinateEnd[0]},${a.coordinateEnd[1]})`);
  if (a.text !== undefined) parts.push(`"${a.text}"`);
  if (a.scrollDirection) parts.push(`${a.scrollDirection}${a.scrollAmount ?? ''}`);
  if (a.duration !== undefined) parts.push(`${a.duration}s`);
  return parts.join(' ');
}

function summarizeTrace(trace: NavigationTrace, language: string): string {
  const head = `Scène ${trace.sceneId} (${trace.success ? 'OK' : 'ÉCHEC'}, ${trace.durationSec}s)`;
  const actions = trace.actions
    .map(
      (a, i) =>
        `  ${i + 1}. ${a.type} ${formatActionDetail(a)} — ${a.reasoning}`,
    )
    .join('\n');
  return `${head} [lang=${language}]\n${actions}`;
}

export function createScripter(options: { provider: ScripterTextProvider }): Scripter {
  return {
    async generate(config, traces) {
      const summary = traces.map((t) => summarizeTrace(t, config.project.language)).join('\n\n');

      const prompt = `Produit (langue: ${config.project.language}):
Nom : ${config.project.name}
URL : ${config.project.url}
Description : ${config.project.description ?? '(non fournie)'}

Traces d'exécution :
${summary}

Produis un Script JSON dans le schéma :
{
  "language": "${config.project.language}",
  "segments": [
    { "id": "seg-<scene>-<n>", "sceneId": "<scene>", "text": "...", "startSec": 0, "estimatedDurationSec": 4.2 },
    ...
  ]
}`;

      return options.provider.completeStructured({
        system: SYSTEM_PROMPT,
        prompt,
        schema: scriptSchema,
        temperature: 0.6,
        maxTokens: 4096,
      });
    },
  };
}

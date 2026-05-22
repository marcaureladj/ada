import type { z } from 'zod';
import { scenarioPlanSchema } from '../schema.js';
import type { RunConfig, ScenarioPlan } from '../types.js';

export interface PlannerTextProvider {
  readonly name: string;
  completeStructured<T>(input: {
    system?: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T>;
}

export interface Planner {
  plan(config: RunConfig): Promise<ScenarioPlan>;
}

export interface PlannerOptions {
  provider: PlannerTextProvider;
}

const SYSTEM_PROMPT = `Tu es un product manager qui prépare une vidéo de documentation.
Tu reçois l'URL d'une web app, sa description, et la langue cible.
Tu produis un ScenarioPlan : une liste ordonnée de 3 à 5 scènes à filmer, du plus simple au plus parlant.

Règles :
- Chaque scène a un objectif clair (1 ligne), des prérequis (autres scènes ou "[]"), une durée estimée en secondes (20-90s typique), et un critère de succès objectif (substring de l'URL ou du titre attendu).
- Pour un site de documentation : commencer par la page d'accueil, naviguer vers une section type "Quickstart", "Getting Started" ou "API Reference".
- Pour une app authentifiée : commencer par signup/login, puis le parcours principal.
- N'invente PAS de fonctionnalités : reste sur ce qui est plausible à partir de l'URL et de la description.`;

async function fetchPageHints(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ADA-Planner/0.0' },
    });
    clearTimeout(timeout);
    if (!response.ok) return `(fetch ${response.status})`;
    const html = await response.text();
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    const description =
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i.exec(html)?.[1]?.trim() ??
      '';
    const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([^<]{2,60})<\/a>/g)]
      .slice(0, 20)
      .map((m) => `- ${m[2]?.trim() ?? ''} → ${m[1] ?? ''}`)
      .join('\n');
    return `Titre: ${title}\nDescription meta: ${description}\nLiens visibles (top 20):\n${links}`;
  } catch (err) {
    return `(fetch a échoué : ${(err as Error).message})`;
  }
}

export function createPlanner(options: PlannerOptions): Planner {
  return {
    async plan(config) {
      if (config.scenarios && config.scenarios.length > 0) {
        return {
          generatedAt: new Date().toISOString(),
          language: config.project.language,
          scenes: config.scenarios.map((s) => ({
            id: s.id,
            objective: s.description,
            preconditions: s.preconditions ?? [],
            estimatedDurationSec: 30,
            successCriteria: s.id,
          })),
        };
      }

      const hints = await fetchPageHints(config.project.url);
      const prompt = `Produit : ${config.project.name}
URL : ${config.project.url}
Langue cible : ${config.project.language}
Description : ${config.project.description ?? '(non fournie)'}

Indices récupérés depuis la page :
${hints}

Produit un ScenarioPlan JSON :
{
  "generatedAt": "${new Date().toISOString()}",
  "language": "${config.project.language}",
  "scenes": [
    { "id": "...", "objective": "...", "preconditions": [], "estimatedDurationSec": 30, "successCriteria": "..." }
  ]
}`;

      return options.provider.completeStructured({
        system: SYSTEM_PROMPT,
        prompt,
        schema: scenarioPlanSchema,
        temperature: 0.5,
        maxTokens: 2048,
      });
    },
  };
}

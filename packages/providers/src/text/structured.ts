import type { z } from 'zod';

const STRUCTURED_INSTRUCTION =
  '\n\nRéponds STRICTEMENT avec un objet JSON valide conforme au schéma demandé.' +
  ' Aucun texte autour, pas de commentaire, pas de markdown.';

export function buildStructuredSystem(userSystem: string | undefined): string {
  return (userSystem ?? '') + STRUCTURED_INSTRUCTION;
}

// Extract a JSON blob from a model response that may include markdown fences,
// preamble, or trailing text.
export function extractJsonBlock(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return raw.slice(firstBracket, lastBracket + 1);
  }
  return raw.trim();
}

export type StructuredParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; feedback: string };

export function tryParseStructured<T>(
  schema: z.ZodType<T>,
  raw: string,
): StructuredParseResult<T> {
  const json = extractJsonBlock(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return {
      ok: false,
      feedback: `JSON invalide : ${(err as Error).message}. Réponds uniquement avec l'objet JSON.`,
    };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  return { ok: false, feedback: `Validation Zod a échoué : ${issues}` };
}

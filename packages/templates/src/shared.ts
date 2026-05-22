import type { TemplateRenderInput } from './types.js';

export function totalDurationSec(input: TemplateRenderInput): number {
  const lastSegment = input.script.segments.at(-1);
  if (!lastSegment) return 0;
  return lastSegment.startSec + lastSegment.estimatedDurationSec;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function stageOpen(compositionId: string, width: number, height: number): string {
  return [
    '<div id="stage"',
    `  data-composition-id="${escapeHtml(compositionId)}"`,
    '  data-start="0"',
    `  data-width="${width}"`,
    `  data-height="${height}">`,
  ].join('\n');
}

export const stageClose = '</div>';

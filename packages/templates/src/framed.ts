import type { AdaTemplate, TemplateRenderInput, TemplateRenderOutput } from './types.js';
import { escapeHtml, stageClose, stageOpen, totalDurationSec } from './shared.js';
import { extractAnnotations } from './annotations.js';
import { buildGsapScript } from './gsap-script.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

// Inner screen frame inside the chrome (computed from CSS below).
const FRAME_LEFT_PCT = 4;
const FRAME_TOP_PCT = 9; // below chrome (URL bar)
const FRAME_WIDTH_PCT = 92;
const FRAME_HEIGHT_PCT = 86;

function annotationHtml(
  id: string,
  type: string,
  xPct: number,
  yPct: number,
  startSec: number,
  durationSec: number,
  label?: string,
): string {
  const labelHtml = label !== undefined ? `<span class="ann-label">${escapeHtml(label)}</span>` : '';
  return `<div id="${id}" class="annotation ${type}" data-start="${startSec.toFixed(3)}" data-duration="${durationSec.toFixed(3)}" data-track-index="2" style="left:${xPct.toFixed(3)}%;top:${yPct.toFixed(3)}%">${labelHtml}</div>`;
}

export const framedTemplate: AdaTemplate = {
  name: 'framed',
  render(input: TemplateRenderInput): TemplateRenderOutput {
    const duration = totalDurationSec(input);
    const annotations = extractAnnotations({
      traces: input.traces,
      script: input.script,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });

    // Map viewport coordinates to percentages of the stage, accounting for the
    // chrome offset and the frame inset.
    const annotationsHtml = annotations
      .map((a) => {
        const xPct = FRAME_LEFT_PCT + (a.x / VIEWPORT_WIDTH) * FRAME_WIDTH_PCT;
        const yPct = FRAME_TOP_PCT + (a.y / VIEWPORT_HEIGHT) * FRAME_HEIGHT_PCT;
        return annotationHtml(a.id, a.type, xPct, yPct, a.startSec, a.durationSec, a.label);
      })
      .join('\n  ');

    const gsapScript = buildGsapScript(annotations);

    const html = [
      '<!doctype html>',
      `<html lang="${input.script.language}">`,
      '<head>',
      '<meta charset="utf-8" />',
      `<title>ADA framed — ${escapeHtml(input.compositionId)}</title>`,
      '<style>',
      '  body { margin: 0; background: #1a1a2e; font-family: system-ui, sans-serif; color: #fff; overflow: hidden; }',
      '  #stage { position: relative; width: 100%; height: 100%; }',
      '  .browser-chrome { position: absolute; top: 2%; left: 4%; right: 4%; height: 5%; background: #2d2d44; border-radius: 12px 12px 0 0; display: flex; align-items: center; gap: 8px; padding: 0 14px; }',
      '  .browser-dot { width: 12px; height: 12px; border-radius: 50%; }',
      '  .browser-dot.red { background: #ff5f57; } .browser-dot.yellow { background: #ffbd2e; } .browser-dot.green { background: #28c840; }',
      '  .screen-wrap { position: absolute; top: 9%; left: 4%; width: 92%; height: 86%; background: #fff; border-radius: 0 0 12px 12px; overflow: hidden; }',
      '  .screen-wrap video { width: 100%; height: 100%; object-fit: cover; }',
      '  .annotation { position: absolute; pointer-events: none; transform: translate(-50%, -50%); }',
      '  .annotation.arrow { width: 48px; height: 48px; }',
      '  .annotation.arrow::after { content: ""; display: block; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 26px solid #ffd700; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); margin: 8px auto 0; }',
      '  .annotation.callout { background: rgba(255,215,0,0.95); color: #1a1a2e; padding: 0.4em 0.8em; border-radius: 6px; font-weight: 600; max-width: 280px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }',
      '  .annotation.zoom-pulse { width: 80px; height: 80px; border: 4px solid #ffd700; border-radius: 50%; box-shadow: 0 0 30px rgba(255,215,0,0.6); }',
      '  .caption { position: absolute; bottom: 2%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: #fff; padding: 0.6em 1.2em; border-radius: 8px; max-width: 80%; text-align: center; }',
      '</style>',
      '</head>',
      '<body>',
      stageOpen(input.compositionId, input.width, input.height),
      '  <div class="browser-chrome"><span class="browser-dot red"></span><span class="browser-dot yellow"></span><span class="browser-dot green"></span></div>',
      '  <div class="screen-wrap">',
      ...input.traces.map(
        (trace) =>
          `    <video data-start="0" data-duration="${trace.durationSec}" data-track-index="0" src="${escapeHtml(trace.capturePath)}" muted></video>`,
      ),
      '  </div>',
      ...input.audio.map(
        (a) =>
          `  <audio data-start="${
            input.script.segments.find((s) => s.id === a.segmentId)?.startSec ?? 0
          }" data-duration="${a.durationSec}" data-track-index="1" src="${escapeHtml(a.path)}"></audio>`,
      ),
      ...input.script.segments.map(
        (s) =>
          `  <div class="caption" data-start="${s.startSec}" data-duration="${s.estimatedDurationSec}" data-track-index="3">${escapeHtml(s.text)}</div>`,
      ),
      annotationsHtml ? `  ${annotationsHtml}` : '',
      stageClose,
      gsapScript,
      '</body>',
      '</html>',
    ].join('\n');

    return { html, durationSec: duration };
  },
};

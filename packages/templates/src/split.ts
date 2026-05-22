import type { AdaTemplate, TemplateRenderInput, TemplateRenderOutput } from './types.js';
import { escapeHtml, stageClose, stageOpen, totalDurationSec } from './shared.js';
import { extractAnnotations } from './annotations.js';
import { buildGsapScript } from './gsap-script.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

export const splitTemplate: AdaTemplate = {
  name: 'split',
  render(input: TemplateRenderInput): TemplateRenderOutput {
    const duration = totalDurationSec(input);

    // For the split template, callouts appear in the right-hand panel rather
    // than overlaid on the video. We only emit callout annotations from type
    // actions; arrows on the video would clash with the narrative panel.
    const allAnnotations = extractAnnotations({
      traces: input.traces,
      script: input.script,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    const callouts = allAnnotations.filter((a) => a.type === 'callout');

    const calloutsHtml = callouts
      .map(
        (a) =>
          `  <div id="${a.id}" class="ann-callout" data-start="${a.startSec.toFixed(3)}" data-duration="${a.durationSec.toFixed(3)}" data-track-index="2">${a.label !== undefined ? escapeHtml(a.label) : '…'}</div>`,
      )
      .join('\n');

    const gsapScript = buildGsapScript(callouts);

    const html = [
      '<!doctype html>',
      `<html lang="${input.script.language}">`,
      '<head><meta charset="utf-8" />',
      `<title>ADA split — ${escapeHtml(input.compositionId)}</title>`,
      '<style>',
      '  body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }',
      '  #stage { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; padding: 16px; box-sizing: border-box; width: 100%; height: 100%; }',
      '  .left { background: #000; border-radius: 8px; overflow: hidden; position: relative; }',
      '  .left video { width: 100%; height: 100%; object-fit: cover; }',
      '  .right { padding: 24px 28px; background: #1e293b; border-radius: 8px; display: flex; flex-direction: column; gap: 14px; }',
      '  .right h2 { margin: 0 0 10px; font-size: 1.6rem; color: #f1f5f9; }',
      '  .scene-item { padding: 12px 14px; border-left: 3px solid #334155; background: rgba(255,255,255,0.03); border-radius: 4px; font-size: 1rem; line-height: 1.4; }',
      '  .ann-callout { padding: 10px 14px; background: rgba(255, 215, 0, 0.15); border: 1px solid rgba(255, 215, 0, 0.4); border-radius: 6px; color: #fef3c7; font-family: ui-monospace, monospace; font-size: 0.95rem; }',
      '  .caption { position: absolute; bottom: 3%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: #fff; padding: 0.5em 1em; border-radius: 6px; max-width: 90%; text-align: center; }',
      '</style>',
      '</head>',
      '<body>',
      stageOpen(input.compositionId, input.width, input.height),
      '  <div class="left">',
      ...input.traces.map(
        (trace) =>
          `    <video data-start="0" data-duration="${trace.durationSec}" data-track-index="0" src="${escapeHtml(trace.capturePath)}" muted></video>`,
      ),
      ...input.script.segments.map(
        (s) =>
          `    <div class="caption" data-start="${s.startSec}" data-duration="${s.estimatedDurationSec}" data-track-index="3">${escapeHtml(s.text)}</div>`,
      ),
      '  </div>',
      '  <div class="right">',
      `    <h2>${escapeHtml(input.compositionId)}</h2>`,
      ...input.script.segments.map(
        (s) =>
          `    <div class="scene-item" data-start="${s.startSec}" data-duration="${s.estimatedDurationSec}" data-track-index="2">${escapeHtml(s.text)}</div>`,
      ),
      calloutsHtml,
      '  </div>',
      ...input.audio.map(
        (a) =>
          `  <audio data-start="${
            input.script.segments.find((s) => s.id === a.segmentId)?.startSec ?? 0
          }" data-duration="${a.durationSec}" data-track-index="1" src="${escapeHtml(a.path)}"></audio>`,
      ),
      stageClose,
      gsapScript,
      '</body>',
      '</html>',
    ].join('\n');

    return { html, durationSec: duration };
  },
};

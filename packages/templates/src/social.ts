import type { AdaTemplate, TemplateRenderInput, TemplateRenderOutput } from './types.js';
import { escapeHtml, stageClose, stageOpen, totalDurationSec } from './shared.js';
import { extractAnnotations } from './annotations.js';
import { buildGsapScript } from './gsap-script.js';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

// Social template is 9:16 by convention regardless of what the caller asked
// for. The screen frame occupies the central ~60% of the height.
const SOCIAL_WIDTH = 1080;
const SOCIAL_HEIGHT = 1920;
const SCREEN_LEFT_PCT = 8;
const SCREEN_TOP_PCT = 18;
const SCREEN_WIDTH_PCT = 84;
const SCREEN_HEIGHT_PCT = 48;

export const socialTemplate: AdaTemplate = {
  name: 'social',
  render(input: TemplateRenderInput): TemplateRenderOutput {
    const duration = totalDurationSec(input);
    const allAnnotations = extractAnnotations({
      traces: input.traces,
      script: input.script,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    // Social only uses zoom-pulse — arrows + callouts clutter the vertical
    // format. Convert click-arrows to zoom-pulses for visual punch.
    const pulses = allAnnotations.map((a) => ({ ...a, type: 'zoom-pulse' as const }));

    const annotationsHtml = pulses
      .map((a) => {
        const xPct = SCREEN_LEFT_PCT + (a.x / VIEWPORT_WIDTH) * SCREEN_WIDTH_PCT;
        const yPct = SCREEN_TOP_PCT + (a.y / VIEWPORT_HEIGHT) * SCREEN_HEIGHT_PCT;
        return `<div id="${a.id}" class="annotation zoom-pulse" data-start="${a.startSec.toFixed(3)}" data-duration="${a.durationSec.toFixed(3)}" data-track-index="2" style="left:${xPct.toFixed(3)}%;top:${yPct.toFixed(3)}%"></div>`;
      })
      .join('\n  ');

    const gsapScript = buildGsapScript(pulses);

    // Force 9:16 regardless of input.width/height.
    const html = [
      '<!doctype html>',
      `<html lang="${input.script.language}">`,
      '<head><meta charset="utf-8" />',
      `<title>ADA social — ${escapeHtml(input.compositionId)}</title>`,
      '<style>',
      '  body { margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: system-ui, sans-serif; color: #fff; overflow: hidden; }',
      '  #stage { position: relative; width: 100%; height: 100%; }',
      `  .screen { position: absolute; top: ${SCREEN_TOP_PCT}%; left: ${SCREEN_LEFT_PCT}%; width: ${SCREEN_WIDTH_PCT}%; height: ${SCREEN_HEIGHT_PCT}%; border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.4); background: #000; }`,
      '  .screen video { width: 100%; height: 100%; object-fit: cover; }',
      '  .annotation.zoom-pulse { position: absolute; width: 100px; height: 100px; border: 5px solid rgba(255,255,255,0.95); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 0 40px rgba(255,255,255,0.5); }',
      '  .caption-big { position: absolute; bottom: 10%; left: 6%; right: 6%; text-align: center; font-size: 2.4rem; font-weight: 800; line-height: 1.2; text-shadow: 0 4px 12px rgba(0,0,0,0.5); }',
      '  .brand { position: absolute; top: 6%; left: 0; right: 0; text-align: center; font-size: 1.4rem; font-weight: 700; letter-spacing: 0.2em; opacity: 0.85; }',
      '</style>',
      '</head>',
      '<body>',
      `<div id="stage" data-composition-id="${escapeHtml(input.compositionId)}" data-start="0" data-width="${SOCIAL_WIDTH}" data-height="${SOCIAL_HEIGHT}">`,
      `  <div class="brand">${escapeHtml(input.script.language === 'fr' ? 'PRÉSENTÉ PAR ADA' : 'POWERED BY ADA')}</div>`,
      '  <div class="screen">',
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
          `  <div class="caption-big" data-start="${s.startSec}" data-duration="${s.estimatedDurationSec}" data-track-index="3">${escapeHtml(s.text)}</div>`,
      ),
      annotationsHtml ? `  ${annotationsHtml}` : '',
      stageClose,
      gsapScript,
      '</body>',
      '</html>',
    ].join('\n');
    // Note: we open the stage manually above instead of via stageOpen so we
    // can force 9:16 dimensions, and stageClose is reused intact.
    void stageOpen;

    return { html, durationSec: duration };
  },
};

import type { AdaTemplate, TemplateRenderInput, TemplateRenderOutput } from './types.js';
import { escapeHtml, stageClose, stageOpen, totalDurationSec } from './shared.js';

export const classicTemplate: AdaTemplate = {
  name: 'classic',
  render(input: TemplateRenderInput): TemplateRenderOutput {
    const duration = totalDurationSec(input);
    const captures = input.traces
      .map(
        (trace, i) =>
          `  <video id="screen-${escapeHtml(trace.sceneId)}" data-start="0" data-duration="${
            trace.durationSec
          }" data-track-index="0" src="${escapeHtml(trace.capturePath)}" muted ${
            i === 0 ? 'autoplay' : ''
          }></video>`,
      )
      .join('\n');

    const audio = input.audio
      .map(
        (a) =>
          `  <audio id="vo-${escapeHtml(a.segmentId)}" data-start="${
            input.script.segments.find((s) => s.id === a.segmentId)?.startSec ?? 0
          }" data-duration="${a.durationSec}" data-track-index="1" src="${escapeHtml(a.path)}"></audio>`,
      )
      .join('\n');

    const captions = input.script.segments
      .map(
        (s) =>
          `  <div class="caption" data-start="${s.startSec}" data-duration="${
            s.estimatedDurationSec
          }" data-track-index="3">${escapeHtml(s.text)}</div>`,
      )
      .join('\n');

    const html = [
      '<!doctype html>',
      '<html lang="' + input.script.language + '">',
      '<head>',
      '  <meta charset="utf-8" />',
      `  <title>ADA classic — ${escapeHtml(input.compositionId)}</title>`,
      '  <style>',
      '    body { margin: 0; background: #000; color: #fff; font-family: system-ui, sans-serif; }',
      '    #stage { position: relative; width: 100%; height: 100%; }',
      '    video, audio { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }',
      '    .caption { position: absolute; bottom: 5%; left: 50%; transform: translateX(-50%); padding: 0.5em 1em; background: rgba(0,0,0,0.6); border-radius: 8px; font-size: 1.25rem; max-width: 80%; text-align: center; }',
      '  </style>',
      '</head>',
      '<body>',
      stageOpen(input.compositionId, input.width, input.height),
      captures,
      audio,
      captions,
      stageClose,
      '</body>',
      '</html>',
    ].join('\n');

    return { html, durationSec: duration };
  },
};

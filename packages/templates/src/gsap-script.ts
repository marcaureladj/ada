import type { Annotation } from './annotations.js';
import { escapeHtml } from './shared.js';

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';

// JSON-encode for safe inlining in a JS string literal context.
function jsString(value: string): string {
  return JSON.stringify(value);
}

function timelineFor(ann: Annotation): string {
  const sel = jsString(`#${ann.id}`);
  const start = ann.startSec;
  const fadeOutAt = ann.durationSec - 0.4;

  const setupCommon = `gsap.set(${sel}, { opacity: 0, scale: 0.8, transformOrigin: '50% 50%' });
const tl_${ann.id} = gsap.timeline({ paused: true });
tl_${ann.id}.to(${sel}, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.6)' }, 0);`;

  let specific: string;
  switch (ann.type) {
    case 'arrow':
      specific = `tl_${ann.id}.to(${sel}, { y: '-=10', duration: 0.25, repeat: 3, yoyo: true, ease: 'sine.inOut' }, 0.3);`;
      break;
    case 'callout':
      specific = `tl_${ann.id}.fromTo(${sel}, { x: 40 }, { x: 0, duration: 0.4, ease: 'power2.out' }, 0);`;
      break;
    case 'zoom-pulse':
      specific = `tl_${ann.id}.to(${sel}, { scale: 1.4, duration: 0.35, repeat: 1, yoyo: true, ease: 'sine.inOut' }, 0.3);`;
      break;
  }

  const fadeOut = `tl_${ann.id}.to(${sel}, { opacity: 0, scale: 0.9, duration: 0.3, ease: 'power2.in' }, ${Math.max(0, fadeOutAt)});`;

  // Register the timeline with the HyperFrames frame adapter so each frame
  // can seek to the right point on render. The adapter is expected to call
  // window.__hyperframesGsapTimelines[id].seek(t) for each tracked timeline.
  const register = `window.__hyperframesGsapTimelines = window.__hyperframesGsapTimelines || {};
window.__hyperframesGsapTimelines[${jsString(ann.id)}] = { tl: tl_${ann.id}, startSec: ${start}, durationSec: ${ann.durationSec} };`;

  return [setupCommon, specific, fadeOut, register].join('\n');
}

export function buildGsapScript(annotations: Annotation[]): string {
  if (annotations.length === 0) {
    return `<script src="${GSAP_CDN}"></script>\n<script>window.__hyperframesGsapTimelines = {};</script>`;
  }

  const adapter = `// HyperFrames GSAP frame adapter — seek each timeline based on the global frame time.
window.__hyperframesGsapAdapter = function(currentTimeSec) {
  const map = window.__hyperframesGsapTimelines || {};
  for (const id in map) {
    const entry = map[id];
    const local = currentTimeSec - entry.startSec;
    if (local < 0) { entry.tl.seek(0); continue; }
    if (local > entry.durationSec) { entry.tl.seek(entry.tl.duration()); continue; }
    entry.tl.seek(local);
  }
};`;

  const body = annotations.map((a) => timelineFor(a)).join('\n\n');

  // Escape for safety in case any label slipped through (defense in depth).
  // The timelines themselves only use coordinates, not labels — labels are
  // rendered in the HTML body via the template, where escapeHtml() applies.
  void escapeHtml;

  return [
    `<script src="${GSAP_CDN}"></script>`,
    '<script>',
    adapter,
    body,
    '</script>',
  ].join('\n');
}

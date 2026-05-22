import type { NavigationTrace, Script } from '@ada/core';

export type AnnotationType = 'arrow' | 'callout' | 'zoom-pulse';

export interface Annotation {
  id: string;
  type: AnnotationType;
  /** Coordinate in viewport pixel space (Computer Use coordinate). */
  x: number;
  y: number;
  startSec: number;
  durationSec: number;
  label?: string;
  sceneId: string;
  actionIndex: number;
}

export interface ExtractAnnotationsInput {
  traces: NavigationTrace[];
  script: Script;
  viewportWidth: number;
  viewportHeight: number;
}

// Time the annotation slightly ahead of the click so the eye finds it.
const LEAD_TIME_SEC = 0.2;
const ARROW_DURATION_SEC = 1.5;
const CALLOUT_DURATION_SEC = 2.5;
const PULSE_DURATION_SEC = 1.2;

// Approximate the time of each action by spreading them evenly across the
// duration of the script segments that belong to the same scene. This is a
// coarse approximation — good enough for v1 — until per-action timestamps
// emitted by Computer Use are reliable.
function sceneTiming(script: Script, sceneId: string): { start: number; duration: number } {
  const segments = script.segments.filter((s) => s.sceneId === sceneId);
  if (segments.length === 0) {
    return { start: 0, duration: 0 };
  }
  const start = segments[0]!.startSec;
  const last = segments.at(-1)!;
  const end = last.startSec + last.estimatedDurationSec;
  return { start, duration: Math.max(0.1, end - start) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function extractAnnotations(input: ExtractAnnotationsInput): Annotation[] {
  const annotations: Annotation[] = [];

  for (const trace of input.traces) {
    if (!trace.success || trace.actions.length === 0) continue;

    const interestingActions = trace.actions.filter((a) =>
      ['left_click', 'right_click', 'double_click', 'triple_click', 'type', 'left_click_drag'].includes(
        a.type,
      ),
    );
    if (interestingActions.length === 0) continue;

    const timing = sceneTiming(input.script, trace.sceneId);
    const perActionSlot = timing.duration / interestingActions.length;

    for (let i = 0; i < interestingActions.length; i++) {
      const action = interestingActions[i]!;
      const actionIndex = trace.actions.indexOf(action);
      const slotMid = timing.start + (i + 0.5) * perActionSlot;
      const startSec = Math.max(0, slotMid - LEAD_TIME_SEC);

      const coord = action.coordinate ?? [
        Math.floor(input.viewportWidth / 2),
        Math.floor(input.viewportHeight / 2),
      ];
      const x = clamp(coord[0], 0, input.viewportWidth);
      const y = clamp(coord[1], 0, input.viewportHeight);

      if (
        action.type === 'left_click' ||
        action.type === 'right_click' ||
        action.type === 'double_click' ||
        action.type === 'triple_click'
      ) {
        annotations.push({
          id: `ann-${trace.sceneId}-${actionIndex}-arrow`,
          type: 'arrow',
          x,
          y,
          startSec,
          durationSec: ARROW_DURATION_SEC,
          sceneId: trace.sceneId,
          actionIndex,
        });
        continue;
      }

      if (action.type === 'type') {
        annotations.push({
          id: `ann-${trace.sceneId}-${actionIndex}-callout`,
          type: 'callout',
          x,
          y,
          startSec,
          durationSec: CALLOUT_DURATION_SEC,
          ...(action.text !== undefined ? { label: action.text } : {}),
          sceneId: trace.sceneId,
          actionIndex,
        });
        continue;
      }

      if (action.type === 'left_click_drag') {
        annotations.push({
          id: `ann-${trace.sceneId}-${actionIndex}-arrow`,
          type: 'arrow',
          x,
          y,
          startSec,
          durationSec: ARROW_DURATION_SEC,
          sceneId: trace.sceneId,
          actionIndex,
        });
        const end = action.coordinateEnd ?? action.coordinate ?? coord;
        annotations.push({
          id: `ann-${trace.sceneId}-${actionIndex}-pulse`,
          type: 'zoom-pulse',
          x: clamp(end[0], 0, input.viewportWidth),
          y: clamp(end[1], 0, input.viewportHeight),
          startSec: startSec + 0.4,
          durationSec: PULSE_DURATION_SEC,
          sceneId: trace.sceneId,
          actionIndex,
        });
      }
    }
  }

  return annotations;
}

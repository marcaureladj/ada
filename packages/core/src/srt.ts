import type { Script } from './types.js';

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`;
}

export function scriptToSrt(script: Script): string {
  return script.segments
    .map((seg, i) => {
      const start = formatTimestamp(seg.startSec, ',');
      const end = formatTimestamp(seg.startSec + seg.estimatedDurationSec, ',');
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}

export function scriptToVtt(script: Script): string {
  const body = script.segments
    .map((seg) => {
      const start = formatTimestamp(seg.startSec, '.');
      const end = formatTimestamp(seg.startSec + seg.estimatedDurationSec, '.');
      return `${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function scriptToTranscriptMarkdown(script: Script, title: string): string {
  const lines = [
    `# ${title}`,
    '',
    `_Langue : ${script.language}_`,
    '',
    ...script.segments.map(
      (seg) =>
        `**[${formatTimestamp(seg.startSec, '.')}]** ${seg.text}`,
    ),
    '',
  ];
  return lines.join('\n');
}

import type {
  AspectRatio,
  AudioSegment,
  NavigationTrace,
  Script,
  TemplateName,
} from './types.js';

export interface TemplateRenderInput {
  compositionId: string;
  script: Script;
  audio: AudioSegment[];
  traces: NavigationTrace[];
  ratio: AspectRatio;
  width: number;
  height: number;
}

export interface TemplateRenderOutput {
  html: string;
  durationSec: number;
}

export interface AdaTemplate {
  readonly name: TemplateName;
  render(input: TemplateRenderInput): TemplateRenderOutput;
}

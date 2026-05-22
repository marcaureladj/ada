export type Language = 'fr' | 'en';

export type VideoFormat = 'mp4' | 'webm';
export type VideoResolution = '720p' | '1080p' | '1440p' | '2160p';
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type TemplateName = 'classic' | 'framed' | 'split' | 'social';

export type AuthMode = 'credentials' | 'api_key' | 'signup' | 'none';

export interface AuthConfig {
  type: AuthMode;
  email?: string;
  password?: string;
  apiKey?: string;
}

export interface ScenarioInput {
  id: string;
  description: string;
  preconditions?: string[];
}

export interface RunConfig {
  project: {
    name: string;
    url: string;
    language: Language;
    description?: string;
  };
  auth?: AuthConfig;
  scenarios?: ScenarioInput[];
  output: {
    format: VideoFormat;
    resolution: VideoResolution;
    ratio: AspectRatio;
    template: TemplateName;
    path: string;
  };
  providers: {
    vision: string;
    text: string;
    tts: string;
    voice?: string;
  };
  hyperframes?: {
    catalog?: string[];
    shaderTransitions?: boolean;
  };
}

export interface Scene {
  id: string;
  objective: string;
  preconditions: string[];
  estimatedDurationSec: number;
  successCriteria: string;
}

export interface ScenarioPlan {
  generatedAt: string;
  language: Language;
  scenes: Scene[];
}

export type AgentActionType =
  | 'left_click'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'triple_click'
  | 'type'
  | 'key'
  | 'mouse_move'
  | 'left_click_drag'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'cursor_position'
  | 'done';

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface AgentAction {
  type: AgentActionType;
  coordinate?: [number, number];
  coordinateEnd?: [number, number];
  text?: string;
  duration?: number;
  scrollAmount?: number;
  scrollDirection?: ScrollDirection;
  reasoning: string;
  timestamp: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
}

export interface NavigationTrace {
  sceneId: string;
  actions: AgentAction[];
  capturePath: string;
  durationSec: number;
  success: boolean;
  error?: string;
}

export interface ScriptSegment {
  id: string;
  sceneId: string;
  text: string;
  startSec: number;
  estimatedDurationSec: number;
}

export interface Script {
  language: Language;
  segments: ScriptSegment[];
}

export interface AudioSegment {
  id: string;
  segmentId: string;
  path: string;
  durationSec: number;
  voice: string;
  provider: string;
}

export interface Composition {
  htmlPath: string;
  assetsDir: string;
  durationSec: number;
  template: TemplateName;
}

export interface AuthReport {
  success: boolean;
  type: AuthMode;
  durationSec: number;
  auditLog: string[];
  storageStatePath?: string;
  error?: string;
}

export interface RunReport {
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scenes: NavigationTrace[];
  outputPath?: string;
  subtitlesPath?: {
    srt: string;
    vtt: string;
  };
  transcriptPath?: string;
  providersUsed: {
    vision: string;
    text: string;
    tts: string;
  };
  authReport?: AuthReport;
  estimatedCostUsd?: number;
  errors: string[];
}

export * from './types.js';
export * from './schema.js';
export * from './errors.js';
export * from './pipeline.js';
export * from './workdir.js';
export * from './srt.js';
export * from './template.js';
export { mp3Duration } from './utils/mp3-duration.js';
export { CostAccumulator, estimateCostUsd, type UsageDelta } from './utils/cost.js';
export {
  withRetry,
  isTransient,
  extractRetryAfterMs,
  type RetryOptions,
  type RetryStats,
} from './utils/retry.js';
export {
  createFileEventSink,
  createMemoryEventSink,
  createCompositeEventSink,
  createRelayEventSink,
  countRetriesByProvider,
  type AdaEvent,
  type EventInput,
  type EventLevel,
  type EventSink,
  type EventStage,
  type MemoryEventSink,
  type RelayEventSink,
} from './events.js';

export {
  createPlanner,
  type Planner,
  type PlannerOptions,
  type PlannerTextProvider,
} from './modules/planner.js';
export {
  createNavigator,
  type Navigator,
  type NavigatorOptions,
  type NavigatorVisionProvider,
} from './modules/navigator.js';
export {
  createAuthModule,
  type AuthModule,
  type AuthOptions,
  type AuthModuleInput,
} from './modules/auth.js';
export {
  createScreenshotRedactor,
  type ScreenshotRedactor,
  type RedactorOptions,
  type CaptureOptions,
} from './modules/screenshot-redactor.js';
export {
  createScripter,
  type Scripter,
  type ScripterTextProvider,
} from './modules/scripter.js';
export {
  createVoicer,
  type Voicer,
  type VoicerOptions,
  type VoicerProvider,
  type TtsSynthesisInput,
  type VoicerSynthesisResult,
} from './modules/voicer.js';
export {
  createComposer,
  type Composer,
  type ComposerOptions,
} from './modules/composer.js';

export const ADA_VERSION = '0.0.0';

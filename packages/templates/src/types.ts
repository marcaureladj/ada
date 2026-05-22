// Re-export the canonical template contract from @ada/core so existing
// import sites (`import type { AdaTemplate } from '@ada/templates'`) keep
// working without creating a build cycle.
export type {
  TemplateRenderInput,
  TemplateRenderOutput,
  AdaTemplate,
} from '@ada/core';

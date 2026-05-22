import { ConfigError, type TemplateName } from '@ada/core';
import type { AdaTemplate } from './types.js';
import { classicTemplate } from './classic.js';
import { framedTemplate } from './framed.js';
import { splitTemplate } from './split.js';
import { socialTemplate } from './social.js';

export * from './types.js';
export {
  extractAnnotations,
  type Annotation,
  type AnnotationType,
  type ExtractAnnotationsInput,
} from './annotations.js';
export { buildGsapScript } from './gsap-script.js';
export { classicTemplate, framedTemplate, splitTemplate, socialTemplate };

const registry: Record<TemplateName, AdaTemplate> = {
  classic: classicTemplate,
  framed: framedTemplate,
  split: splitTemplate,
  social: socialTemplate,
};

export function resolveTemplate(name: TemplateName): AdaTemplate {
  const template = registry[name];
  if (!template) {
    throw new ConfigError(
      `Unknown template "${name}". Known: ${Object.keys(registry).join(', ')}.`,
    );
  }
  return template;
}

export function listTemplates(): TemplateName[] {
  return Object.keys(registry) as TemplateName[];
}

import { z } from 'zod';

export const languageSchema = z.enum(['fr', 'en']);
export const videoFormatSchema = z.enum(['mp4', 'webm']);
export const videoResolutionSchema = z.enum(['720p', '1080p', '1440p', '2160p']);
export const aspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);
export const templateNameSchema = z.enum(['classic', 'framed', 'split', 'social']);
export const authModeSchema = z.enum(['credentials', 'api_key', 'signup', 'none']);

export const authConfigSchema = z
  .object({
    type: authModeSchema,
    email: z.string().email().optional(),
    password: z.string().optional(),
    apiKey: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'credentials') {
      if (!data.email) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'auth.email requis pour type=credentials',
        });
      }
      if (!data.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'auth.password requis pour type=credentials',
        });
      }
    }
    if (data.type === 'signup' && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'auth.email requis pour type=signup',
      });
    }
    if (data.type === 'api_key' && !data.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: 'auth.apiKey requis pour type=api_key',
      });
    }
  });

export const scenarioInputSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  preconditions: z.array(z.string()).optional(),
});

export const runConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    language: languageSchema,
    description: z.string().optional(),
  }),
  auth: authConfigSchema.optional(),
  scenarios: z.array(scenarioInputSchema).optional(),
  output: z.object({
    format: videoFormatSchema.default('mp4'),
    resolution: videoResolutionSchema.default('1080p'),
    ratio: aspectRatioSchema.default('16:9'),
    template: templateNameSchema.default('framed'),
    path: z.string().min(1),
  }),
  providers: z.object({
    vision: z.string().default('claude-computer-use'),
    text: z.string().default('claude'),
    tts: z.string().default('elevenlabs'),
    voice: z.string().optional(),
  }),
  hyperframes: z
    .object({
      catalog: z.array(z.string()).optional(),
      shaderTransitions: z.boolean().optional(),
    })
    .optional(),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  preconditions: z.array(z.string()),
  estimatedDurationSec: z.number().positive(),
  successCriteria: z.string().min(1),
});

export const scenarioPlanSchema = z.object({
  generatedAt: z.string(),
  language: languageSchema,
  scenes: z.array(sceneSchema).min(1),
});

export const agentActionTypeSchema = z.enum([
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'mouse_move',
  'left_click_drag',
  'scroll',
  'wait',
  'screenshot',
  'cursor_position',
  'done',
]);

const coordinateSchema = z.tuple([z.number(), z.number()]);

export const agentActionSchema = z.object({
  type: agentActionTypeSchema,
  coordinate: coordinateSchema.optional(),
  coordinateEnd: coordinateSchema.optional(),
  text: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  scrollAmount: z.number().nonnegative().optional(),
  scrollDirection: z.enum(['up', 'down', 'left', 'right']).optional(),
  reasoning: z.string(),
  timestamp: z.string(),
  screenshotBefore: z.string().optional(),
  screenshotAfter: z.string().optional(),
});

export const scriptSegmentSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  text: z.string().min(1),
  startSec: z.number().nonnegative(),
  estimatedDurationSec: z.number().positive(),
});

export const scriptSchema = z.object({
  language: languageSchema,
  segments: z.array(scriptSegmentSchema),
});

export type RunConfigInput = z.input<typeof runConfigSchema>;
export type RunConfigParsed = z.output<typeof runConfigSchema>;

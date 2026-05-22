import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigError, runConfigSchema, type RunConfig } from '@ada/core';

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

function interpolateEnv(raw: string): string {
  return raw.replace(ENV_VAR_PATTERN, (_match, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new ConfigError(`Variable d'environnement requise non définie : ${name}`);
    }
    return value;
  });
}

export interface LoadConfigOptions {
  configPath?: string;
  url?: string;
  credentials?: string;
  output?: string;
  language?: 'fr' | 'en';
  template?: string;
}

function applyOverrides(base: unknown, overrides: LoadConfigOptions): unknown {
  if (typeof base !== 'object' || base === null) return base;
  const cfg = base as Record<string, unknown>;
  const project = { ...(cfg['project'] as Record<string, unknown> | undefined) };
  const output = { ...(cfg['output'] as Record<string, unknown> | undefined) };
  const auth = { ...(cfg['auth'] as Record<string, unknown> | undefined) };

  if (overrides.url) project['url'] = overrides.url;
  if (overrides.language) project['language'] = overrides.language;
  if (overrides.output) output['path'] = overrides.output;
  if (overrides.template) output['template'] = overrides.template;

  if (overrides.credentials) {
    const [email, password] = overrides.credentials.split(':');
    auth['type'] = 'credentials';
    if (email) auth['email'] = email;
    if (password) auth['password'] = password;
  }

  cfg['project'] = project;
  cfg['output'] = output;
  if (Object.keys(auth).length > 0) cfg['auth'] = auth;
  return cfg;
}

export function loadConfig(options: LoadConfigOptions): RunConfig {
  let raw: Record<string, unknown> = {};

  if (options.configPath) {
    const absolute = resolve(process.cwd(), options.configPath);
    if (!existsSync(absolute)) {
      throw new ConfigError(`Fichier de configuration introuvable : ${absolute}`);
    }
    const fileContent = readFileSync(absolute, 'utf8');
    const interpolated = interpolateEnv(fileContent);
    const parsed = parseYaml(interpolated) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ConfigError('Le fichier YAML doit contenir un objet à la racine.');
    }
    raw = parsed as Record<string, unknown>;
  } else {
    raw = {
      project: { name: 'ADA Demo', language: options.language ?? 'fr', url: options.url ?? '' },
      output: { path: options.output ?? './demo.mp4' },
      providers: {
        vision: process.env['ADA_VISION_PROVIDER'] ?? 'claude-computer-use',
        text: process.env['ADA_TEXT_PROVIDER'] ?? 'claude',
        tts: process.env['ADA_TTS_PROVIDER'] ?? 'elevenlabs',
      },
    };
  }

  const withOverrides = applyOverrides(raw, options);
  const result = runConfigSchema.safeParse(withOverrides);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Configuration invalide :\n${issues}`);
  }
  return result.data as RunConfig;
}

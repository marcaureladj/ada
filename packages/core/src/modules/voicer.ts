import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mp3Duration } from '../utils/mp3-duration.js';
import { ModuleError } from '../errors.js';
import type { AudioSegment, Language, RunConfig, Script } from '../types.js';
import type { Workdir } from '../workdir.js';

export interface TtsSynthesisInput {
  text: string;
  language: Language;
  voice: string;
}

export interface VoicerSynthesisResult {
  audio: Buffer;
  durationSec: number;
}

export interface VoicerProvider {
  readonly name: string;
  synthesize(input: TtsSynthesisInput): Promise<VoicerSynthesisResult>;
}

export interface Voicer {
  synthesize(config: RunConfig, script: Script, workdir: Workdir): Promise<AudioSegment[]>;
}

export interface VoicerOptions {
  provider: VoicerProvider;
  cacheDir?: string;
}

function cacheKey(text: string, voice: string, provider: string, language: string): string {
  return createHash('sha256')
    .update(`${provider}|${language}|${voice}|${text}`)
    .digest('hex')
    .slice(0, 24);
}

export function createVoicer(options: VoicerOptions): Voicer {
  const ttsCacheDir = join(options.cacheDir ?? '.ada-cache', 'tts');
  mkdirSync(ttsCacheDir, { recursive: true });

  return {
    async synthesize(config, script, workdir) {
      const voice = config.providers.voice ?? 'french-pro-male';
      const results: AudioSegment[] = [];

      for (const segment of script.segments) {
        const key = cacheKey(segment.text, voice, options.provider.name, script.language);
        const cachedPath = join(ttsCacheDir, `${key}.mp3`);
        let audio: Buffer;
        let durationSec: number;

        if (existsSync(cachedPath)) {
          audio = readFileSync(cachedPath);
          durationSec = mp3Duration(audio);
        } else {
          const result = await options.provider.synthesize({
            text: segment.text,
            language: script.language,
            voice,
          });
          audio = result.audio;
          durationSec = result.durationSec;
          writeFileSync(cachedPath, audio);
        }

        const finalPath = workdir.audioPath(segment.id);
        writeFileSync(finalPath, audio);

        results.push({
          id: `audio-${segment.id}`,
          segmentId: segment.id,
          path: finalPath,
          durationSec,
          voice,
          provider: options.provider.name,
        });
      }

      if (results.length === 0) {
        throw new ModuleError('Voicer', 'Aucun segment audio produit (script vide).');
      }
      return results;
    },
  };
}

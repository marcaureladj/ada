export type OutputFormat = 'text' | 'json';

export function emit(format: OutputFormat, payload: unknown, textFallback: string): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${textFallback}\n`);
  }
}

export function emitError(format: OutputFormat, code: string, message: string): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify({ ok: false, code, message }, null, 2)}\n`);
  } else {
    process.stderr.write(`[ada] ${code}: ${message}\n`);
  }
}

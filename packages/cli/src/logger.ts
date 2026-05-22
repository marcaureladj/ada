import pino, { type LoggerOptions, destination } from 'pino';

const level = process.env['ADA_LOG_LEVEL'] ?? 'info';
const usePretty = process.stderr.isTTY && process.env['ADA_LOG_FORMAT'] !== 'json';

// Logs always go to stderr so that --output-format json on stdout stays
// machine-parseable when consumed by other agents (Claude Code, Codex, etc.).
const stderrStream = destination({ dest: 2, sync: true });

const baseOptions: LoggerOptions = { level };
const options: LoggerOptions = usePretty
  ? {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          destination: 2,
        },
      },
    }
  : baseOptions;

export const logger = usePretty ? pino(options) : pino(options, stderrStream);

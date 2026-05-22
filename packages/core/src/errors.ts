export class AdaError extends Error {
  override readonly name: string = 'AdaError';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NotImplementedError extends AdaError {
  override readonly name = 'NotImplementedError';

  constructor(feature: string) {
    super('E_NOT_IMPLEMENTED', `${feature} is not implemented yet (P1 spike pending).`);
  }
}

export class ConfigError extends AdaError {
  override readonly name = 'ConfigError';

  constructor(message: string) {
    super('E_CONFIG', message);
  }
}

export class ModuleError extends AdaError {
  override readonly name = 'ModuleError';

  constructor(module: string, message: string) {
    super('E_MODULE', `[${module}] ${message}`);
  }
}

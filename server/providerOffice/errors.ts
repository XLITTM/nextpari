export class ProviderOfficeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ProviderOfficeError';
    this.code = code;
  }
}

export function officeError(error: unknown): string {
  if (error instanceof ProviderOfficeError) return error.code;
  return 'PROVIDER_OFFICE_FAILED';
}

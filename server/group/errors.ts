export class GroupControlError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'GroupControlError';
    this.code = code;
  }
}

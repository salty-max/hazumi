/** User-facing failure: print the message, no stack, non-zero exit. */
export class UserError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "UserError";
    this.exitCode = exitCode;
  }
}

export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError;
}

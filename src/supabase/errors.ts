/** Thrown for database or Storage errors the helpers don't turn into a result. `code` is the Postgres SQLSTATE when there is one. */
export class CeraDatabaseError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CeraDatabaseError';
  }
}

export function fail(error: { message: string; code?: string }): never {
  throw new CeraDatabaseError(error.message, error.code);
}

/** User-facing error copy mapping (rebuild of legacy errorCopy). */

export function errorCopy(code: string | undefined, fallback = 'Something went wrong'): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Sign in to continue.';
    case 'FORBIDDEN':
      return 'You do not have access to that.';
    case 'NOT_FOUND':
      return 'We could not find that.';
    case 'INVALID':
      return 'Check the form and try again.';
    default:
      return fallback;
  }
}

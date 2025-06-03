/**
 * Error Utilities - Type Safety for Unknown Error Types
 * Single responsibility: Type guards for error handling
 */

export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'Unknown error occurred';
}

export function createErrorMessage(prefix: string, error: unknown): string {
  return `${prefix}: ${getErrorMessage(error)}`;
}

import { ApiError } from '../api/client';

/**
 * Turns a failed load into the two strings a status overlay shows: a one-line
 * "which call, what status" summary and an optional human detail. These are
 * dev/tester-facing technical strings and deliberately NOT translated — only
 * the label around them is.
 */
export function describeLoadError(err: unknown): { summary: string; detail?: string } {
  if (err instanceof ApiError) {
    const where = err.method && err.path ? `${err.method} ${err.path}` : 'Request';
    const outcome = err.status === 0 ? 'network error' : String(err.status);
    return {
      summary: `${where} → ${outcome}`,
      detail: err.problem?.detail ?? err.problem?.title ?? err.message,
    };
  }
  if (err instanceof Error) return { summary: err.message };
  return { summary: String(err) };
}

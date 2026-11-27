import { i18n } from './index';
import { ApiError } from '../api/client';
import { DemoTradeError } from '../lib/map/WorldModel';

/**
 * The machine-readable rejection code behind a failed action, if there is
 * one — `ApiError.problem.rejection` (BuildRejection/FoundingRejection/
 * TradeRejection/DispatchRejection/FieldOrderRejection/TrainRejection, all
 * wired with a `rejection` extension), `ApiError.problem.error`
 * (AuthErrorResponse's snake_case codes), or `DemoTradeError.rejection`
 * (demo mode's local equivalent of a TradeRejection/DispatchRejection 409).
 * `undefined` when the error carries no such code (a few rune/offer 409s
 * still don't) or isn't one of these error types at all.
 */
export function rejectionCodeOf(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.problem?.rejection ?? err.problem?.error;
  if (err instanceof DemoTradeError) return err.rejection;
  return undefined;
}

/**
 * Translates a failed action's rejection code via `apiErrors.rejections.<code>`,
 * falling back to the caller-supplied (already-translated) fallback text when
 * there's no code or no translation for it (a request that got no answer, or a 5xx, says that instead) — never the backend's raw English
 * `problem.detail`, which would leak English into a non-English UI.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const code = rejectionCodeOf(err);
  if (!code) {
    // No answer at all, or the server failed: say so instead of the action's own "failed" text, which reads as a refusal.
    if (err instanceof ApiError && err.status === 0) return i18n.global.t('apiErrors.transport.network') as string;
    if (err instanceof ApiError && err.status >= 500) return i18n.global.t('apiErrors.transport.server') as string;
    return fallback;
  }
  const path = `apiErrors.rejections.${code}`;
  return i18n.global.te(path) ? (i18n.global.t(path) as string) : fallback;
}

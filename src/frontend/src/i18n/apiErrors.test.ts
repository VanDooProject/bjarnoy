// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { DemoTradeError } from '../lib/map/WorldModel';
import { apiErrorMessage, rejectionCodeOf } from './apiErrors';
import apiErrorsEn from './locales/en/apiErrors.json';

function apiError(rejection?: string, error?: string): ApiError {
  return new ApiError(409, { detail: 'rejected', rejection, error });
}

const REJECTION_CODES = Object.keys(apiErrorsEn.rejections);

describe('apiErrors', () => {
  it('has a translated message for every cataloged rejection code', () => {
    for (const code of REJECTION_CODES) {
      const message = apiErrorMessage(apiError(code), 'fallback text');
      expect(message, code).not.toBe('fallback text');
      expect(message, code).not.toBe(code);
    }
  });

  it('reads the rejection code off an ApiError problem', () => {
    expect(rejectionCodeOf(apiError('NotEnoughResources'))).toBe('NotEnoughResources');
  });

  it('falls back to the AuthErrorResponse error code when there is no rejection', () => {
    expect(rejectionCodeOf(apiError(undefined, 'premium_required'))).toBe('premium_required');
    expect(apiErrorMessage(apiError(undefined, 'premium_required'), 'fallback text')).not.toBe('fallback text');
  });

  it('reads the rejection code off a DemoTradeError', () => {
    const err = new DemoTradeError('OfferNotOpen');
    expect(rejectionCodeOf(err)).toBe('OfferNotOpen');
    expect(apiErrorMessage(err, 'fallback text')).not.toBe('fallback text');
  });

  it('falls back to the caller-supplied text when there is no rejection code', () => {
    expect(apiErrorMessage(apiError(), 'fallback text')).toBe('fallback text');
    expect(apiErrorMessage(new Error('boom'), 'fallback text')).toBe('fallback text');
  });

  it('falls back to the caller-supplied text for an unrecognized rejection code', () => {
    expect(apiErrorMessage(apiError('NotARealRejection'), 'fallback text')).toBe('fallback text');
  });
});

import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { describeLoadError } from './loadError';

describe('describeLoadError', () => {
  it('names method, path and status for an HTTP failure and prefers the problem detail', () => {
    const err = new ApiError(503, { title: 'Unavailable', detail: 'db down' }, 'GET', '/worlds/abc/islands');
    expect(describeLoadError(err)).toEqual({ summary: 'GET /worlds/abc/islands → 503', detail: 'db down' });
  });

  it('falls back to the problem title, then the error message', () => {
    expect(describeLoadError(new ApiError(500, { title: 'Boom' }, 'POST', '/x')).detail).toBe('Boom');
    expect(describeLoadError(new ApiError(500, undefined, 'POST', '/x')).detail).toBe(
      'Request failed with status 500',
    );
  });

  it('says "network error" for status 0', () => {
    const err = new ApiError(0, undefined, 'GET', '/worlds/abc');
    expect(describeLoadError(err).summary).toBe('GET /worlds/abc → network error');
  });

  it('handles an ApiError without method/path', () => {
    expect(describeLoadError(new ApiError(404, undefined)).summary).toBe('Request → 404');
  });

  it('uses the message of a plain Error and stringifies anything else', () => {
    expect(describeLoadError(new Error('atlas failed'))).toEqual({ summary: 'atlas failed' });
    expect(describeLoadError('oops')).toEqual({ summary: 'oops' });
  });
});

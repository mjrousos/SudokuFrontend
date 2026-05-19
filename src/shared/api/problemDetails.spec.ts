import { describe, it, expect } from 'vitest';

import { ApiError, parseApiError } from '@/shared/api/problemDetails';

function jsonResponse(status: number, body: unknown, contentType = 'application/problem+json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('parseApiError', () => {
  it('parses an RFC 7807 problem+json body', async () => {
    const res = jsonResponse(409, {
      type: 'https://httpstatuses.io/409',
      title: 'display_name_in_use',
      status: 409,
      detail: 'That display name is taken.',
    });
    const err = await parseApiError(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.title).toBe('display_name_in_use');
    expect(err.detail).toBe('That display name is taken.');
    expect(err.type).toBe('https://httpstatuses.io/409');
  });

  it('captures validation errors map', async () => {
    const res = jsonResponse(400, {
      title: 'validation',
      errors: { email: ['Required'], password: ['Too short'] },
    });
    const err = await parseApiError(res);
    expect(err.fieldErrors).toEqual({ email: ['Required'], password: ['Too short'] });
  });

  it('falls back to statusText for empty body', async () => {
    const res = new Response('', { status: 401, statusText: 'Unauthorized' });
    const err = await parseApiError(res);
    expect(err.status).toBe(401);
    expect(err.title).toBe('Unauthorized');
    expect(err.detail).toBeUndefined();
  });

  it('handles non-JSON content type with body text', async () => {
    const res = new Response('plain message', { status: 502, headers: { 'content-type': 'text/plain' } });
    const err = await parseApiError(res);
    expect(err.status).toBe(502);
    expect(err.detail).toBe('plain message');
  });

  it('handles malformed JSON gracefully', async () => {
    const res = new Response('not json', { status: 500, headers: { 'content-type': 'application/json' } });
    const err = await parseApiError(res);
    expect(err.status).toBe(500);
    expect(err.detail).toBeUndefined();
  });
});

describe('ApiError', () => {
  it('uses detail as the Error message when provided', () => {
    const err = new ApiError({ status: 400, title: 'bad_request', detail: 'Email is required.' });
    expect(err.message).toBe('Email is required.');
  });

  it('falls back to title when detail is missing', () => {
    const err = new ApiError({ status: 401, title: 'invalid_credentials' });
    expect(err.message).toBe('invalid_credentials');
  });
});
